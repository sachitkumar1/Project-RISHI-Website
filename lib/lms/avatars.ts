/**
 * Profile photos live in Supabase Storage (bucket lms-files, under
 * avatars/<sha1 of email>/), and the database's lms_profiles.avatar column
 * holds only a short pointer: "storage:avatars/<sha1>/<time>.jpg".
 *
 * WHY: photos used to be stored in the database as inline images (~20–30 KB
 * each) and every page that shows members (dashboard, meetings, directory…)
 * received ALL of them embedded in its data on every load — uncacheable, so
 * egress grew with members × visits. Now pages receive a short, stable address
 * per photo, served with a long "never changes" cache: each browser downloads
 * each photo once. A new photo gets a new file name, so updates show at once.
 *
 * Older inline photos still in the database are moved into Storage the first
 * time they're read; if that ever fails, the inline image is returned as before.
 */
import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UPLOAD_BUCKET } from "@/lib/lms/files";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
let _c: SupabaseClient | null = null;
const sb = () => (_c ??= createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } }));

const PREFIX = "storage:";
const PATH_RE = /^avatars\/[a-f0-9]{40}\/[a-z0-9-]+\.(jpg|png|webp)$/;
const memFiles = new Map<string, Buffer>(); // test mode (no database)

const lc = (e: string) => e.trim().toLowerCase();
const dirFor = (email: string) => crypto.createHash("sha1").update(lc(email)).digest("hex");

/** The address pages use for a stored photo. */
export const avatarUrl = (path: string) => `/api/lms/avatar?p=${encodeURIComponent(path)}`;
export const isAvatarPath = (p: string) => PATH_RE.test(p) && !p.includes("..");

const TYPES: [string, string, (b: Buffer) => boolean][] = [
  ["image/jpeg", "jpg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", "png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/webp", "webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"],
];

function decodeDataUrl(dataUrl: string): { bytes: Buffer; ext: string; type: string } | null {
  const m = dataUrl.match(/^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  const t = TYPES.find(([, , test]) => test(bytes));
  return t ? { bytes, ext: t[1], type: t[0] } : null;
}

async function putFile(path: string, bytes: Buffer, type: string, upsert = false) {
  if (!usingSupabase) { memFiles.set(path, bytes); return; }
  const { error } = await sb().storage.from(UPLOAD_BUCKET).upload(path, bytes, { contentType: type, upsert });
  if (error) throw new Error(error.message);
}
async function removeFile(path: string) {
  if (!usingSupabase) { memFiles.delete(path); return; }
  await sb().storage.from(UPLOAD_BUCKET).remove([path]).catch(() => {});
}

/**
 * Turn what's stored in the avatar column into what pages receive:
 * a pointer becomes its short address; an old inline image is moved into
 * Storage (once) and then becomes its address too.
 */
export async function resolveStoredAvatar(email: string, stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith(PREFIX)) {
    const path = stored.slice(PREFIX.length);
    return isAvatarPath(path) ? avatarUrl(path) : null;
  }
  if (!stored.startsWith("data:image/")) return null;
  // Legacy inline photo → Storage. The file name comes from the image's own
  // hash, so two requests migrating the same photo at once write the same file.
  const img = decodeDataUrl(stored);
  if (!img) return stored;
  const hash = crypto.createHash("sha1").update(img.bytes).digest("hex").slice(0, 12);
  const path = `avatars/${dirFor(email)}/legacy-${hash}.${img.ext}`;
  try {
    await putFile(path, img.bytes, img.type, true);
    if (usingSupabase) {
      await sb().from("lms_profiles").update({ avatar: PREFIX + path }).eq("email", lc(email));
    }
    return avatarUrl(path);
  } catch (e) {
    console.error("avatars: couldn't move an inline photo to Storage — serving it inline", (e as Error).message);
    return stored; // still works exactly as before
  }
}

/** Save a new photo (data URL from the settings cropper), or remove it (null).
 *  Returns the pointer to store in lms_profiles.avatar. */
export async function storeAvatar(email: string, dataUrl: string | null, previous: string | null): Promise<string | null> {
  let pointer: string | null = null;
  if (dataUrl) {
    const img = decodeDataUrl(dataUrl);
    if (!img) throw new Error("Please use a JPEG, PNG or WebP image.");
    const path = `avatars/${dirFor(email)}/${Date.now()}.${img.ext}`;
    await putFile(path, img.bytes, img.type);
    pointer = PREFIX + path;
  }
  // Remove the photo this replaces (only ever this member's own folder).
  if (previous?.startsWith(PREFIX)) {
    const old = previous.slice(PREFIX.length);
    if (isAvatarPath(old) && old.startsWith(`avatars/${dirFor(email)}/`) && PREFIX + old !== pointer) await removeFile(old);
  }
  return pointer;
}

/** The photo's bytes, for the caching image route. */
export async function readAvatarFile(path: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!isAvatarPath(path)) return null;
  const type = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
  if (!usingSupabase) { const b = memFiles.get(path); return b ? { bytes: b, type } : null; }
  const { data, error } = await sb().storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), type };
}
