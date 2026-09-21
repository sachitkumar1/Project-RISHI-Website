/**
 * Per-member dashboard banner: the choice lives in lms_profiles.banner (JSON
 * text); an uploaded photo lives in Supabase Storage (bucket lms-files, under
 * banners/<sha1 of email>/), NOT in the database — photos are far bigger than
 * avatars, and Storage has its own allowance.
 */
import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UPLOAD_BUCKET } from "@/lib/lms/files";
import { parseBanner, type BannerChoice } from "@/lib/lms/bannerPresets";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
let _c: SupabaseClient | null = null;
const sb = () => (_c ??= createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } }));

const lc = (e: string) => e.trim().toLowerCase();
const mem = new Map<string, BannerChoice>();
const memFiles = new Map<string, Buffer>();

export const MAX_BANNER_BYTES = 2_500_000; // after the browser shrinks it, a banner is ~150–400 KB

export async function getBanner(email: string): Promise<{ choice: BannerChoice | null; url: string | null }> {
  const key = lc(email);
  let choice: BannerChoice | null = null;
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_profiles").select("banner").eq("email", key).maybeSingle();
    if (error) return { choice: null, url: null }; // e.g. migration not run yet → default banner
    choice = parseBanner(data?.banner ?? null);
  } else {
    choice = mem.get(key) ?? null;
  }
  if (choice?.kind !== "upload") return { choice, url: null };
  // A STABLE address on our own site, not a fresh signed Storage link. Signed
  // links change on every request, so browsers could never cache the photo and
  // re-downloaded it (~400 KB of Supabase egress) on every dashboard visit. The
  // file name includes its upload time, so a new photo gets a new address and
  // the long cache can never show a stale one.
  return { choice, url: `/api/lms/profile/banner/image?p=${encodeURIComponent(choice.path)}` };
}

/** Owner check: the photo's folder is the sha1 of its owner's email. */
export function bannerPathBelongsTo(email: string, path: string): boolean {
  const dir = crypto.createHash("sha1").update(lc(email)).digest("hex");
  return path.startsWith(`banners/${dir}/`) && !path.includes("..");
}

/** The uploaded photo's bytes (for the caching image route). */
export async function readBannerImage(path: string): Promise<{ bytes: Buffer; type: string } | null> {
  const type = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
  if (!usingSupabase) { const b = memFiles.get(path); return b ? { bytes: b, type } : null; }
  const { data, error } = await sb().storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), type };
}

async function writeChoice(key: string, choice: BannerChoice | null) {
  if (!usingSupabase) { if (choice) mem.set(key, choice); else mem.delete(key); return; }
  const { error } = await sb().from("lms_profiles")
    .upsert({ email: key, banner: choice ? JSON.stringify(choice) : null, updated_at: new Date().toISOString() }, { onConflict: "email" });
  if (error) throw new Error(/banner/.test(error.message) ? "Banners need a one-time database update (migration-banner.sql)." : error.message);
}

async function removeOldUpload(prev: BannerChoice | null, keepPath?: string) {
  if (prev?.kind !== "upload" || prev.path === keepPath) return;
  if (usingSupabase) await sb().storage.from(UPLOAD_BUCKET).remove([prev.path]).catch(() => {});
  else memFiles.delete(prev.path);
}

/** Choose a preset/photo, re-position an upload, or reset (null). */
export async function setBanner(email: string, choice: BannerChoice | null): Promise<void> {
  const key = lc(email);
  const { choice: prev } = await getBanner(key);
  if (choice?.kind === "upload" && (prev?.kind !== "upload" || prev.path !== choice.path))
    throw new Error("That photo isn't yours to use.");
  await writeChoice(key, choice);
  await removeOldUpload(prev, choice?.kind === "upload" ? choice.path : undefined);
}

const MAGIC: [string, (b: Buffer) => boolean, string][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, "jpg"],
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png"],
  ["image/webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP", "webp"],
];

/** Store an uploaded photo and make it this member's banner. */
export async function uploadBanner(email: string, bytes: Buffer, pos = 50): Promise<BannerChoice> {
  const key = lc(email);
  if (bytes.length > MAX_BANNER_BYTES) throw new Error("That image is too large.");
  const type = MAGIC.find(([, test]) => test(bytes));
  if (!type) throw new Error("Please use a JPEG, PNG or WebP image.");
  const dir = crypto.createHash("sha1").update(key).digest("hex");
  const path = `banners/${dir}/${Date.now()}.${type[2]}`;
  if (usingSupabase) {
    const { error } = await sb().storage.from(UPLOAD_BUCKET).upload(path, bytes, { contentType: type[0], upsert: false });
    if (error) throw new Error(/not found/i.test(error.message) ? `Storage bucket "${UPLOAD_BUCKET}" doesn't exist yet.` : error.message);
  } else memFiles.set(path, bytes);
  const { choice: prev } = await getBanner(key);
  const choice: BannerChoice = { kind: "upload", path, pos: Math.max(0, Math.min(100, Math.round(pos))) };
  try {
    await writeChoice(key, choice);
  } catch (e) {
    if (usingSupabase) await sb().storage.from(UPLOAD_BUCKET).remove([path]).catch(() => {}); // don't orphan it
    throw e;
  }
  await removeOldUpload(prev, path);
  return choice;
}
