// ============================================================================
//  Files — the browser behind /dashboard/files.
// ----------------------------------------------------------------------------
//  Reads the index that lib/lms/drive.ts builds, applies per-folder visibility,
//  and handles files uploaded through the site (bytes in Supabase Storage).
//
//  VISIBILITY MODEL
//    Because the server reads Drive through a service account, it can see every
//    file in the mirrored folders. Who sees what is therefore OUR decision, not
//    Drive's. Each folder can carry an audience; a folder without one inherits
//    from its parent, and a year root without one falls back to the club-wide
//    default in lms_settings. Checks run on the SERVER — the UI only hides
//    things for convenience.
// ============================================================================

import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/members";
import type { ProjectGroup } from "@/lib/lms/types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export const UPLOAD_BUCKET = "lms-files";
/** Per-file ceiling for site uploads. Supabase's free tier is 1 GB total. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client)
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  return _client;
}

// ------------------------------------------------------------------ types
export type FileAudience = "all" | "leads" | "exec" | "vpp" | "groups";

export type FileNode = {
  id: string;
  driveId: string | null;
  parentId: string | null;
  name: string;
  mimeType: string;
  kind: "folder" | "file" | "shortcut";
  source: "drive" | "upload";
  sizeBytes: number | null;
  webViewLink: string | null;
  year: string | null;
  path: string;
  modifiedAt: string | null;
  uploadedBy: string | null;
  /** Folders only: the audience in force here (resolved through inheritance). */
  audience?: FileAudience;
  /** Folders only: true when the audience is set on this folder itself. */
  audienceExplicit?: boolean;
  audienceGroups?: ProjectGroup[];
};

export type VisibilityRule = { folderId: string; audience: FileAudience; groups: ProjectGroup[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
const toNode = (r: any): FileNode => ({
  id: r.id,
  driveId: r.drive_id ?? null,
  parentId: r.parent_id ?? null,
  name: r.name,
  mimeType: r.mime_type ?? "",
  kind: (r.kind ?? "file") as FileNode["kind"],
  source: (r.source ?? "drive") as FileNode["source"],
  sizeBytes: r.size_bytes ?? null,
  webViewLink: r.web_view_link ?? null,
  year: r.year ?? null,
  path: r.path ?? "",
  modifiedAt: r.modified_at ?? null,
  uploadedBy: r.uploaded_by ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A folder's own id as used by parent_id: Drive items key on drive_id,
 *  uploaded folders on their row id. */
export const nodeKey = (n: FileNode): string => n.driveId ?? n.id;

// ------------------------------------------------------------------ settings
const DEFAULT_AUDIENCE_KEY = "files_default_audience";

export async function getDefaultAudience(): Promise<FileAudience> {
  if (!usingSupabase) return "all";
  try {
    const { data } = await sb()
      .from("lms_settings").select("value").eq("key", DEFAULT_AUDIENCE_KEY).maybeSingle();
    return normalizeAudience(data?.value);
  } catch {
    return "all";
  }
}

export async function setDefaultAudience(a: FileAudience): Promise<void> {
  if (!usingSupabase) return;
  const { error } = await sb().from("lms_settings").upsert(
    { key: DEFAULT_AUDIENCE_KEY, value: a, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

export function normalizeAudience(v: unknown): FileAudience {
  return v === "leads" || v === "exec" || v === "vpp" || v === "groups" ? v : "all";
}

// ---------------------------------------------------------------- visibility
export async function listVisibilityRules(): Promise<Map<string, VisibilityRule>> {
  const map = new Map<string, VisibilityRule>();
  if (!usingSupabase) return map;
  const { data, error } = await sb().from("lms_file_visibility").select("*");
  if (error) throw new Error(error.message);
  for (const r of data ?? [])
    map.set(r.folder_id, {
      folderId: r.folder_id,
      audience: normalizeAudience(r.audience),
      groups: (r.groups ?? []) as ProjectGroup[],
    });
  return map;
}

export async function setVisibility(
  folderId: string,
  audience: FileAudience,
  groups: ProjectGroup[],
): Promise<void> {
  if (!usingSupabase) return;
  const { error } = await sb().from("lms_file_visibility").upsert(
    { folder_id: folderId, audience, groups, updated_at: new Date().toISOString() },
    { onConflict: "folder_id" },
  );
  if (error) throw new Error(error.message);
}

/** Drop a folder's own rule so it inherits from its parent again. */
export async function clearVisibility(folderId: string): Promise<void> {
  if (!usingSupabase) return;
  const { error } = await sb().from("lms_file_visibility").delete().eq("folder_id", folderId);
  if (error) throw new Error(error.message);
}

/** Does this member satisfy an audience? */
export function memberMatches(m: Member, rule: { audience: FileAudience; groups: ProjectGroup[] }): boolean {
  switch (rule.audience) {
    case "all":
      return true;
    case "leads":
      return m.roles.lead || m.roles.nmtLeader || m.roles.exec || m.roles.vpp;
    case "exec":
      return m.roles.exec || m.roles.vpp;
    case "vpp":
      return m.roles.vpp;
    case "groups":
      return m.roles.vpp || rule.groups.includes(m.group);
  }
}

// ------------------------------------------------------------------- reading
// Local preview only: with no Supabase configured, serve a small slice of the
// real folder shape so the browser can be worked on without a database. The
// same dual-mode idea as seedTasks/seedEvents in store.ts.
const SEED: FileNode[] = (
  [
    ["143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", null, "2025-2026 Project RISHI", "folder", ""],
    ["1avvwirYScoTAoQFu3vc2luYrpb8YDS2n", null, "2026-2027 Project RISHI", "folder", ""],
    ["1IcLQgHgXuwH8PLAVCK13GeKurojrNxb_", "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", "Exec", "folder", ""],
    ["1Uvj_XnAJNYxjoAj7cbIvHqP0RLhm_NgV", "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", "Project Groups", "folder", ""],
    ["1EncobyQ5aS-uFDpZRcEgVWqdwjize6zY", "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", "Photos!", "folder", ""],
    ["1uxNut0HH8Bwt54BgyQFs5QIHYWMYlyxhQq1rxX0KLB8", "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", "Master Task Tracker 25-26", "file", "application/vnd.google-apps.spreadsheet"],
    ["1JsLOsJ3Jj1oElCGZ7XAsUekEJ6wgkrCefnxUqDHgDnY", "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", "Project RISHI Constitution 2025-2026", "file", "application/vnd.google-apps.document"],
    ["1D2nMTS6AZlp3mYmO6bTVuuQIZu4ABls4FP6BhVf2xaQ", "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", "Project RISHI Accountability Document 2025-2026", "file", "application/vnd.google-apps.document"],
    ["1IBlQLcGtF3vKp5c9iQYEV2oZ_D1Mz20g", "1Uvj_XnAJNYxjoAj7cbIvHqP0RLhm_NgV", "Education", "folder", ""],
    ["1DRxzutyzcj6SWrRi1TS6eM-IlAxCZi0i", "1Uvj_XnAJNYxjoAj7cbIvHqP0RLhm_NgV", "WatSan", "folder", ""],
    ["1IvupmhO4pv27BJV3f8FwkQQTLjCHg_Uj", "1Uvj_XnAJNYxjoAj7cbIvHqP0RLhm_NgV", "Health", "folder", ""],
    ["1-l68ie2HY2AmMXQhATpW7ukzHd5aja2t", "1Uvj_XnAJNYxjoAj7cbIvHqP0RLhm_NgV", "Womens", "folder", ""],
  ] as const
).map(([id, parent, name, kind, mime]) => ({
  id,
  driveId: id,
  parentId: parent,
  name,
  mimeType: kind === "folder" ? "application/vnd.google-apps.folder" : mime,
  kind: kind as FileNode["kind"],
  source: "drive" as const,
  sizeBytes: null,
  webViewLink: `https://drive.google.com/file/d/${id}/view`,
  year: "2025-2026",
  path: "",
  modifiedAt: "2026-04-29T00:00:00.000Z",
  uploadedBy: null,
}));

async function allRows(): Promise<FileNode[]> {
  if (!usingSupabase) return SEED;
  const { data, error } = await sb()
    .from("lms_files")
    .select("id,source,drive_id,parent_id,name,mime_type,kind,size_bytes,web_view_link,year,path,modified_at,uploaded_by")
    .eq("deleted", false)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toNode);
}

type Resolved = {
  nodes: FileNode[];
  byKey: Map<string, FileNode>;
  effective: Map<string, VisibilityRule>; // folder key → the rule actually in force
};

/** Load the whole index and resolve every folder's effective audience. */
export async function loadIndex(): Promise<Resolved> {
  const [nodes, rules, fallback] = await Promise.all([
    allRows(),
    listVisibilityRules(),
    getDefaultAudience(),
  ]);

  const byKey = new Map<string, FileNode>();
  for (const n of nodes) byKey.set(nodeKey(n), n);

  const effective = new Map<string, VisibilityRule>();
  const resolve = (key: string, seen = new Set<string>()): VisibilityRule => {
    const cached = effective.get(key);
    if (cached) return cached;
    if (seen.has(key)) return { folderId: key, audience: fallback, groups: [] }; // cycle guard
    seen.add(key);

    const own = rules.get(key);
    let out: VisibilityRule;
    if (own) out = own;
    else {
      const node = byKey.get(key);
      const parent = node?.parentId;
      out = parent
        ? { ...resolve(parent, seen), folderId: key }
        : { folderId: key, audience: fallback, groups: [] };
    }
    effective.set(key, out);
    return out;
  };

  for (const n of nodes) if (n.kind === "folder") resolve(nodeKey(n));
  return { nodes, byKey, effective };
}

function ruleFor(idx: Resolved, key: string | null, fallback: FileAudience): VisibilityRule {
  if (!key) return { folderId: "", audience: fallback, groups: [] };
  return idx.effective.get(key) ?? { folderId: key, audience: fallback, groups: [] };
}

/** Can this member see the contents of a folder? */
function canSee(m: Member, idx: Resolved, folderKey: string | null, fallback: FileAudience): boolean {
  return memberMatches(m, ruleFor(idx, folderKey, fallback));
}

export type FolderView = {
  folder: FileNode | null; // null = the top level (the year folders)
  breadcrumbs: { key: string; name: string }[];
  children: FileNode[];
  canUpload: boolean;
};

/** One folder's visible contents, plus its breadcrumb trail. */
export async function listFolder(m: Member, folderKey: string | null): Promise<FolderView | null> {
  const idx = await loadIndex();
  const fallback = await getDefaultAudience();

  const decorate = (n: FileNode): FileNode => {
    if (n.kind !== "folder") return n;
    const r = ruleFor(idx, nodeKey(n), fallback);
    return { ...n, audience: r.audience, audienceGroups: r.groups };
  };

  if (!folderKey) {
    const roots = idx.nodes
      .filter((n) => n.parentId === null && n.kind === "folder")
      .filter((n) => canSee(m, idx, nodeKey(n), fallback))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest school year first
    return { folder: null, breadcrumbs: [], children: roots.map(decorate), canUpload: false };
  }

  const folder = idx.byKey.get(folderKey);
  if (!folder || folder.kind !== "folder") return null;
  if (!canSee(m, idx, folderKey, fallback)) return null; // indistinguishable from "not there"

  const crumbs: { key: string; name: string }[] = [];
  let cur: FileNode | undefined = folder;
  const guard = new Set<string>();
  while (cur && !guard.has(nodeKey(cur))) {
    guard.add(nodeKey(cur));
    crumbs.unshift({ key: nodeKey(cur), name: cur.name });
    cur = cur.parentId ? idx.byKey.get(cur.parentId) : undefined;
  }

  const children = idx.nodes
    .filter((n) => n.parentId === folderKey)
    .filter((n) => (n.kind === "folder" ? canSee(m, idx, nodeKey(n), fallback) : true))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
    );

  return { folder: decorate(folder), breadcrumbs: crumbs, children: children.map(decorate), canUpload: true };
}

/** Name search across everything the member is allowed to see. */
export async function searchFiles(m: Member, q: string, limit = 60): Promise<FileNode[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const idx = await loadIndex();
  const fallback = await getDefaultAudience();
  return idx.nodes
    .filter((n) => n.name.toLowerCase().includes(needle))
    .filter((n) => canSee(m, idx, n.parentId, fallback))
    .slice(0, limit);
}

/** Every folder, for the visibility editor in Settings. */
export async function listFoldersForSettings(): Promise<FileNode[]> {
  const idx = await loadIndex();
  const rules = await listVisibilityRules();
  const fallback = await getDefaultAudience();
  return idx.nodes
    .filter((n) => n.kind === "folder")
    .map((n) => {
      const key = nodeKey(n);
      const eff = ruleFor(idx, key, fallback);
      return {
        ...n,
        audience: eff.audience,
        audienceGroups: eff.groups,
        audienceExplicit: rules.has(key),
      };
    })
    .sort((a, b) => `${a.year}/${a.path}/${a.name}`.localeCompare(`${b.year}/${b.path}/${b.name}`));
}

// ------------------------------------------------------------------ uploads
export type UploadInput = {
  folderKey: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy: string;
};

export async function createUpload(m: Member, input: UploadInput): Promise<FileNode> {
  if (!usingSupabase) throw new Error("Uploads need Supabase configured.");
  if (input.bytes.length > MAX_UPLOAD_BYTES)
    throw new Error(
      `That file is ${(input.bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB — put larger files in Drive and re-sync instead.`,
    );

  const idx = await loadIndex();
  const fallback = await getDefaultAudience();
  const folder = idx.byKey.get(input.folderKey);
  if (!folder || folder.kind !== "folder") throw new Error("That folder doesn't exist.");
  if (!canSee(m, idx, input.folderKey, fallback)) throw new Error("You can't add files to that folder.");

  const safe = input.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const storagePath = `${input.folderKey}/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await sb()
    .storage.from(UPLOAD_BUCKET)
    .upload(storagePath, input.bytes, { contentType: input.mimeType || "application/octet-stream", upsert: false });
  if (upErr)
    throw new Error(
      /bucket/i.test(upErr.message)
        ? `Storage bucket "${UPLOAD_BUCKET}" doesn't exist yet — create it in Supabase → Storage (keep it private).`
        : upErr.message,
    );

  const row = {
    source: "upload",
    drive_id: null,
    parent_id: input.folderKey,
    name: input.name.slice(0, 200),
    mime_type: input.mimeType || "application/octet-stream",
    kind: "file",
    size_bytes: input.bytes.length,
    web_view_link: null,
    year: folder.year,
    path: folder.path ? `${folder.path}/${folder.name}` : folder.name,
    modified_at: new Date().toISOString(),
    storage_path: storagePath,
    uploaded_by: input.uploadedBy,
    deleted: false,
  };
  const { data, error } = await sb().from("lms_files").insert(row).select("*").single();
  if (error) {
    await sb().storage.from(UPLOAD_BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(error.message);
  }
  return toNode(data);
}

/** A short-lived link to an uploaded file. Drive items use their webViewLink. */
export async function signedUrlFor(m: Member, fileId: string): Promise<string | null> {
  if (!usingSupabase) return null;
  const { data, error } = await sb()
    .from("lms_files").select("*").eq("id", fileId).eq("deleted", false).maybeSingle();
  if (error || !data) return null;
  if (data.source === "drive") return data.web_view_link ?? null;
  if (!data.storage_path) return null;

  const idx = await loadIndex();
  const fallback = await getDefaultAudience();
  if (!canSee(m, idx, data.parent_id ?? null, fallback)) return null;

  const { data: signed, error: sErr } = await sb()
    .storage.from(UPLOAD_BUCKET).createSignedUrl(data.storage_path, 60 * 10);
  if (sErr) return null;
  return signed?.signedUrl ?? null;
}

/** Remove an uploaded file. Drive-sourced rows are never deletable from here. */
export async function deleteUpload(m: Member, fileId: string): Promise<void> {
  if (!usingSupabase) return;
  const { data } = await sb().from("lms_files").select("*").eq("id", fileId).maybeSingle();
  if (!data) throw new Error("That file doesn't exist.");
  if (data.source !== "upload") throw new Error("Files mirrored from Drive have to be removed in Drive.");

  const mine = (data.uploaded_by ?? "").toLowerCase() === m.email.toLowerCase();
  if (!mine && !m.roles.vpp && !m.roles.webmaster)
    throw new Error("Only whoever uploaded this file (or a VP/President) can remove it.");

  if (data.storage_path) await sb().storage.from(UPLOAD_BUCKET).remove([data.storage_path]).catch(() => {});
  const { error } = await sb().from("lms_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
}

/** Total bytes held in Supabase Storage, for the Settings panel. */
export async function uploadUsageBytes(): Promise<number> {
  if (!usingSupabase) return 0;
  const { data } = await sb().from("lms_files").select("size_bytes").eq("source", "upload").eq("deleted", false);
  return (data ?? []).reduce((n, r) => n + (r.size_bytes ?? 0), 0);
}
