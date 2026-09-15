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
export type FileAudience =
  | "all"
  | "leads"
  | "exec"
  | "vpp"
  | "groups"      // members of the listed project groups
  | "group_leads" // ONLY the leads of the listed project groups
  | "nmt";        // ONLY New Member Training leaders

export type FileNode = {
  id: string;
  driveId: string | null;
  parentId: string | null;
  name: string;
  mimeType: string;
  kind: "folder" | "file" | "shortcut";
  source: "drive" | "upload" | "task";
  sizeBytes: number | null;
  webViewLink: string | null;
  year: string | null;
  path: string;
  modifiedAt: string | null;
  uploadedBy: string | null;
  /** Content-search results only: context around the match. */
  snippet?: string;
  /** Whether the asking member may delete this file. */
  canDelete?: boolean;
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

const AUDIENCES: FileAudience[] = ["all", "leads", "exec", "vpp", "groups", "group_leads", "nmt"];

export function normalizeAudience(v: unknown): FileAudience {
  return AUDIENCES.includes(v as FileAudience) ? (v as FileAudience) : "all";
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
    // A lead sees their OWN group's submissions and nobody else's. Deliberately
    // not m.roles.lead alone — that would let every lead read every group.
    case "group_leads":
      return m.roles.vpp || (m.roles.lead && rule.groups.includes(m.group));
    case "nmt":
      return m.roles.vpp || m.roles.nmtLeader;
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

const PAGE = 1000;

/**
 * Every visible row in the index.
 *
 * Paged deliberately: PostgREST caps a response at 1000 rows, and once the
 * older school years were mirrored the index passed 1800. A single unpaged
 * query silently returned the first 1000 by name, which quietly dropped the
 * "Tasks" folder off the end of the alphabet — it looked like a permissions
 * bug and wasn't. Any new query over this table needs the same treatment.
 */
async function allRows(): Promise<FileNode[]> {
  if (!usingSupabase) return SEED;
  const out: FileNode[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb()
      .from("lms_files")
      .select("id,source,drive_id,parent_id,name,mime_type,kind,size_bytes,web_view_link,year,path,modified_at,uploaded_by")
      .eq("deleted", false)
      .order("name")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(toNode));
    if (!data || data.length < PAGE) break;
  }
  return out;
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

/**
 * Should this folder appear at all?
 *
 * Being allowed to open a folder isn't enough — a folder whose contents are all
 * restricted would show up, invite a click, and reveal an empty page, which
 * both wastes the click and hints at what's inside. So a folder is listed only
 * if it holds something this person can actually reach. A folder that is empty
 * for everyone still shows: there's nothing to hide, and hiding it would make
 * new folders invisible until someone put a file in them.
 */
function visibleFolder(m: Member, idx: Resolved, folder: FileNode, fallback: FileAudience): boolean {
  if (!canSee(m, idx, nodeKey(folder), fallback)) return false;

  const childrenOf = (key: string) => idx.nodes.filter((n) => n.parentId === key);
  const reachable = (key: string, depth = 0): boolean | null => {
    if (depth > 12) return null;
    const kids = childrenOf(key);
    if (kids.length === 0) return null; // genuinely empty — not a permission matter
    let sawSomething = false;
    for (const k of kids) {
      if (k.kind !== "folder") return true; // a file they can see, since they can see this folder
      if (!canSee(m, idx, nodeKey(k), fallback)) { sawSomething = true; continue; }
      const deeper = reachable(nodeKey(k), depth + 1);
      if (deeper !== false) return true; // visible subfolder, empty or otherwise
      sawSomething = true;
    }
    return sawSomething ? false : null;
  };

  return reachable(nodeKey(folder)) !== false;
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
      .filter((n) => visibleFolder(m, idx, n, fallback))
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

  const folderRule = ruleFor(idx, folderKey, fallback);
  const mayClear = canDeleteInFolder(m, folder, folderRule);

  const children = idx.nodes
    .filter((n) => n.parentId === folderKey)
    .filter((n) => (n.kind === "folder" ? visibleFolder(m, idx, n, fallback) : true))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
    )
    .map((n) => ({
      ...decorate(n),
      // Drive-mirrored items are managed in Drive, never deleted from here.
      canDelete:
        n.kind !== "folder" &&
        n.source !== "drive" &&
        (mayClear || (n.uploadedBy ?? "").toLowerCase() === m.email.toLowerCase()),
    }));

  return { folder: decorate(folder), breadcrumbs: crumbs, children, canUpload: true };
}

export type SearchMode = "names" | "contents";
export type SearchOpts = { wholeWord?: boolean; caseSensitive?: boolean };

/**
 * Search everything the member is allowed to see.
 *
 * mode 'names'    — file and folder names only (fast, always available)
 * mode 'contents' — names AND the indexed text inside files. Matching rows come
 *                   back with a short snippet around the first hit, so the
 *                   result explains itself rather than looking arbitrary.
 *
 * Content matching runs in Postgres (ilike on content_text) rather than in
 * memory, because content_text holds whole documents and pulling all of it into
 * the server on every keystroke would be wasteful. Visibility is still applied
 * here, after the query.
 */
export async function searchFiles(
  m: Member,
  q: string,
  mode: SearchMode = "names",
  limit = 200,
  opts: SearchOpts = {},
): Promise<FileNode[]> {
  const raw = q.trim();
  if (raw.length < 2) return [];
  const needle = raw.toLowerCase();

  const idx = await loadIndex();
  const fallback = await getDefaultAudience();
  const visible = (n: FileNode) => canSee(m, idx, n.parentId, fallback);

  // Whole-word and case-sensitivity are applied here rather than in SQL: the
  // database narrows the candidates with a cheap substring match, and this
  // refines them precisely. Doing it the other way would need a regex query
  // across every stored document.
  const matcher = buildMatcher(raw, opts);

  const byName = idx.nodes.filter((n) => matcher(n.name)).filter(visible);
  if (mode === "names" || !usingSupabase) return byName.slice(0, limit);

  // Content hits, excluding anything already matched by name.
  const seen = new Set(byName.map((n) => n.id));
  const escaped = needle.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await sb()
    .from("lms_files")
    .select("id,source,drive_id,parent_id,name,mime_type,kind,size_bytes,web_view_link,year,path,modified_at,uploaded_by,content_text")
    .eq("deleted", false)
    .ilike("content_text", `%${escaped}%`)
    .limit(limit * 2);
  if (error) return byName.slice(0, limit);

  const contentHits: FileNode[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    const text = row.content_text ?? "";
    if (!matcher(text)) continue; // the SQL match was loose; this is the real test
    const node = toNode(row);
    if (!visible(node)) continue;
    contentHits.push({ ...node, snippet: snippetAround(text, raw, opts) });
  }

  return [...byName, ...contentHits].slice(0, limit);
}

/** Escape a string so it can sit inside a regular expression literally. */
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build the test a file has to pass. Whole-word uses lookarounds rather than
 * \b so that terms starting or ending in punctuation still behave.
 */
function buildMatcher(term: string, opts: SearchOpts): (text: string) => boolean {
  const flags = opts.caseSensitive ? "" : "i";
  const body = escapeRe(term);
  const pattern = opts.wholeWord ? `(?<![\\w])${body}(?![\\w])` : body;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    re = new RegExp(escapeRe(term), flags); // lookbehind unsupported — fall back
  }
  return (text: string) => re.test(text ?? "");
}

/** ~160 characters of context around the first match, trimmed to word edges. */
function snippetAround(text: string, term: string, opts: SearchOpts = {}): string {
  const needle = opts.caseSensitive ? term : term.toLowerCase();
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const at = hay.indexOf(needle);
  if (at < 0) return "";
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + needle.length + 100);
  let out = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) out = `…${out.replace(/^\S*\s/, "")}`;
  if (end < text.length) out = `${out.replace(/\s\S*$/, "")}…`;
  return out;
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

// ============================================================================
//  Task submissions
// ----------------------------------------------------------------------------
//  Files attached to a task submission live in their own branch of the tree,
//  alongside the mirrored Drive years:
//
//      Tasks/
//        Education/  Water & Sanitation/  Women's Empowerment/  Health/  NMT/
//          <task title>/
//            <uploaded file>   (labelled with who submitted it)
//
//  These folders are synthetic — they exist only in lms_files, never in Drive.
//  They carry source = 'task' so the Drive sync (which only ever touches
//  source = 'drive' rows) can't flag them deleted, and so deleteUpload refuses
//  them: a submission is evidence of work, not a file to casually bin.
//
//  Visibility is seeded by the migration: each project-group folder is
//  'group_leads' for that one group, and NMT is 'nmt'. A lead therefore sees
//  their own group's submissions and no one else's.
// ============================================================================

export const TASKS_ROOT = "tasks";
export const taskGroupFolderKey = (g: ProjectGroup | "NMT") => `tasks:${g}`;
export const taskFolderKey = (taskGroupId: string) => `tasks:t:${taskGroupId}`;

/**
 * Which folder a task's submissions belong in.
 *
 * A task assigned by an NMT leader to a newbie is new-member training work, so
 * it files under NMT — unless the assigner is also that newbie's project lead,
 * in which case it's ordinary group work and files under the group. Everything
 * else follows the assignee's project group.
 */
export function taskFolderGroup(
  assigner: Member | null,
  assignee: Member | null,
): ProjectGroup | "NMT" {
  if (
    assigner?.roles.nmtLeader &&
    assignee?.roles.newbie &&
    !(assigner.roles.lead && assigner.group === assignee.group)
  )
    return "NMT";
  return (assignee?.group ?? assigner?.group ?? "E") as ProjectGroup;
}

/** Create the Tasks/<group>/<task title> chain if it isn't there yet. */
async function ensureTaskFolder(
  group: ProjectGroup | "NMT",
  taskGroupId: string,
  taskTitle: string,
): Promise<string> {
  if (!usingSupabase) throw new Error("Task uploads need Supabase configured.");
  const groupKey = taskGroupFolderKey(group);
  const folderKey = taskFolderKey(taskGroupId);

  // The root and the five group folders are seeded by the migration, but create
  // them defensively so a fresh database can't 500 on the first upload.
  const rows = [
    { drive_id: TASKS_ROOT, parent_id: null, name: "Tasks", path: "" },
    { drive_id: groupKey, parent_id: TASKS_ROOT, name: TASK_GROUP_NAMES[group], path: "Tasks" },
    {
      drive_id: folderKey,
      parent_id: groupKey,
      name: taskTitle.trim() || "Untitled task",
      path: `Tasks/${TASK_GROUP_NAMES[group]}`,
    },
  ].map((r) => ({
    ...r,
    source: "task",
    mime_type: "application/vnd.google-apps.folder",
    kind: "folder",
    year: null,
    deleted: false,
  }));

  // ignoreDuplicates so an existing task folder keeps the title it was created
  // with rather than being rewritten on every upload.
  const { error } = await sb()
    .from("lms_files")
    .upsert(rows, { onConflict: "drive_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return folderKey;
}

export const TASK_GROUP_NAMES: Record<ProjectGroup | "NMT", string> = {
  E: "Education",
  R: "Water & Sanitation",
  W: "Women's Empowerment",
  H: "Health",
  NMT: "NMT",
};

export type TaskUploadInput = {
  taskGroupId: string;
  taskTitle: string;
  group: ProjectGroup | "NMT";
  name: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy: string;
};

/** Attach a file to a task submission. */
export async function createTaskUpload(input: TaskUploadInput): Promise<FileNode> {
  if (!usingSupabase) throw new Error("Task uploads need Supabase configured.");
  if (input.bytes.length > MAX_UPLOAD_BYTES)
    throw new Error(
      `That file is ${(input.bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );

  const folderKey = await ensureTaskFolder(input.group, input.taskGroupId, input.taskTitle);
  const safe = input.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const storagePath = `tasks/${input.taskGroupId}/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await sb()
    .storage.from(UPLOAD_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: input.mimeType || "application/octet-stream",
      upsert: false,
    });
  if (upErr)
    throw new Error(
      /bucket/i.test(upErr.message)
        ? `Storage bucket "${UPLOAD_BUCKET}" doesn't exist yet — create it in Supabase → Storage (keep it private).`
        : upErr.message,
    );

  const row = {
    source: "task",
    drive_id: null,
    parent_id: folderKey,
    name: input.name.slice(0, 200),
    mime_type: input.mimeType || "application/octet-stream",
    kind: "file",
    size_bytes: input.bytes.length,
    year: null,
    path: `Tasks/${TASK_GROUP_NAMES[input.group]}/${input.taskTitle}`,
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

/** Files attached to one task group (all assignees' submissions for it). */
export async function listTaskFiles(taskGroupId: string): Promise<FileNode[]> {
  if (!usingSupabase) return [];
  const { data, error } = await sb()
    .from("lms_files")
    .select("id,source,drive_id,parent_id,name,mime_type,kind,size_bytes,web_view_link,year,path,modified_at,uploaded_by")
    .eq("parent_id", taskFolderKey(taskGroupId))
    .eq("deleted", false)
    .order("modified_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toNode);
}

/**
 * Remove an attachment. The person who uploaded it can take it back while the
 * task is still open; once it's approved the submission is a record, so only a
 * VP/President can remove it.
 */
export async function deleteTaskUpload(
  m: Member,
  fileId: string,
  taskIsComplete: boolean,
): Promise<void> {
  if (!usingSupabase) return;
  const { data } = await sb().from("lms_files").select("*").eq("id", fileId).maybeSingle();
  if (!data) throw new Error("That file doesn't exist.");
  if (data.source !== "task") throw new Error("That isn't a task attachment.");

  const mine = (data.uploaded_by ?? "").toLowerCase() === m.email.toLowerCase();
  if (!(m.roles.vpp || (mine && !taskIsComplete)))
    throw new Error(
      taskIsComplete
        ? "This task has been approved, so its attachments can't be removed."
        : "Only the person who uploaded this can remove it.",
    );

  if (data.storage_path) await sb().storage.from(UPLOAD_BUCKET).remove([data.storage_path]).catch(() => {});
  const { error } = await sb().from("lms_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
}

/**
 * Remove every attachment one person made to a task, bytes included.
 *
 * Used when a submission stops existing: the assignee takes their submission
 * back, or a manager deletes the task outright. Leaving orphaned bytes in the
 * bucket would quietly eat the 1 GB allowance and keep work visible in Files
 * that no longer exists as a task.
 */
export async function purgeTaskUploads(
  taskGroupId: string,
  assigneeEmail?: string,
): Promise<number> {
  if (!usingSupabase) return 0;
  let q = sb().from("lms_files").select("id,storage_path").eq("parent_id", taskFolderKey(taskGroupId));
  if (assigneeEmail) q = q.eq("uploaded_by", assigneeEmail.toLowerCase());
  const { data, error } = await q;
  if (error || !data?.length) return 0;

  const paths = data.map((r) => r.storage_path).filter(Boolean) as string[];
  if (paths.length) await sb().storage.from(UPLOAD_BUCKET).remove(paths).catch(() => {});
  await sb().from("lms_files").delete().in("id", data.map((r) => r.id));

  // If that emptied the task's folder, the folder goes too — an empty folder
  // named after a task that no longer exists is just clutter in Files.
  if (!assigneeEmail) await removeTaskFolderIfEmpty(taskGroupId);
  return data.length;
}

/** Drop a task's folder once nothing is left inside it. */
export async function removeTaskFolderIfEmpty(taskGroupId: string): Promise<boolean> {
  if (!usingSupabase) return false;
  const key = taskFolderKey(taskGroupId);
  const { count } = await sb()
    .from("lms_files").select("*", { count: "exact", head: true }).eq("parent_id", key);
  if ((count ?? 0) > 0) return false;
  const { error } = await sb().from("lms_files").delete().eq("drive_id", key).eq("source", "task");
  return !error;
}

/**
 * Can this person delete files in a given folder?
 *
 * Leads may clear out their own project group's folders; NMT leaders may clear
 * the NMT folder. VP/President may do either. Deliberately NOT "any lead" —
 * that would let an Education lead delete Health's submissions.
 */
export function canDeleteInFolder(m: Member, folder: FileNode | null, rule: VisibilityRule): boolean {
  if (m.roles.vpp || m.roles.webmaster) return true;
  if (rule.audience === "nmt") return m.roles.nmtLeader;
  if ((rule.audience === "group_leads" || rule.audience === "groups") && m.roles.lead)
    return rule.groups.includes(m.group);
  // Elsewhere in the tree, a lead may remove things from their own group's area.
  if (m.roles.lead && folder?.path)
    return folder.path.toLowerCase().includes(GROUP_PATH_HINT[m.group].toLowerCase());
  return false;
}

/** How each project group's folder is named in the mirrored Drive tree. */
const GROUP_PATH_HINT: Record<ProjectGroup, string> = {
  E: "Education", R: "WatSan", W: "Women", H: "Health",
};

/**
 * Delete a file a member owns or oversees.
 *
 * Drive-mirrored files can't be removed: the site reads Drive with a read-only
 * scope, so the only honest options are "delete it in Drive" or silently hide
 * it here, and hiding it would drift the site out of sync with Drive.
 */
export async function deleteFileAsLead(m: Member, fileId: string): Promise<void> {
  if (!usingSupabase) return;
  const { data } = await sb().from("lms_files").select("*").eq("id", fileId).maybeSingle();
  if (!data) throw new Error("That file doesn't exist.");
  if (data.source === "drive")
    throw new Error("This file lives in Google Drive — delete it there and re-sync.");

  const idx = await loadIndex();
  const fallback = await getDefaultAudience();
  const folder = data.parent_id ? idx.byKey.get(data.parent_id) ?? null : null;
  const rule = ruleFor(idx, data.parent_id ?? null, fallback);

  const mine = (data.uploaded_by ?? "").toLowerCase() === m.email.toLowerCase();
  if (!mine && !canDeleteInFolder(m, folder, rule))
    throw new Error("You can't delete files in this folder.");

  if (data.storage_path) await sb().storage.from(UPLOAD_BUCKET).remove([data.storage_path]).catch(() => {});
  const { error } = await sb().from("lms_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
}
