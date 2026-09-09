// ============================================================================
//  Meetings — per-group meeting agendas + live notes, plus per-group templates.
//  Supabase when configured, else in-memory. Tables: lms_meetings,
//  lms_meeting_templates. Meeting tasks are real lms_tasks tagged meeting_id.
// ============================================================================

import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Meeting, MeetingBlock, MeetingTemplate, ProjectGroup } from "@/lib/lms/types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client)
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  return _client;
}
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const lc = (e: string) => e.trim().toLowerCase();

const mem = { meetings: [] as Meeting[], templates: new Map<string, MeetingBlock[]>() };

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromRow = (r: any): Meeting => ({
  id: r.id,
  group: r.group_code as ProjectGroup,
  title: r.title ?? "",
  date: r.meeting_date ?? null,
  location: r.location ?? "",
  notetaker: r.notetaker ?? "",
  snack: r.snack ?? "",
  attendees: Array.isArray(r.attendees) ? r.attendees : [],
  blocks: Array.isArray(r.blocks) ? r.blocks : [],
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// A tiny starter outline for a group with no template yet.
function starterBlocks(): MeetingBlock[] {
  return [
    { id: uid(), kind: "heading", text: "Icebreaker", indent: 0 },
    { id: uid(), kind: "bullet", text: "", indent: 0 },
    { id: uid(), kind: "heading", text: "Updates", indent: 0 },
    { id: uid(), kind: "bullet", text: "", indent: 0 },
    { id: uid(), kind: "heading", text: "Next steps", indent: 0 },
    { id: uid(), kind: "bullet", text: "", indent: 0 },
  ];
}

// ---------------------------------------------------------------- templates
export async function getTemplate(group: ProjectGroup): Promise<MeetingTemplate> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("lms_meeting_templates").select("*").eq("group_code", group).maybeSingle();
    if (error) throw new Error(error.message);
    return { group, blocks: (data?.blocks as MeetingBlock[]) ?? starterBlocks() };
  }
  return { group, blocks: mem.templates.get(group) ?? starterBlocks() };
}

export async function setTemplate(group: ProjectGroup, blocks: MeetingBlock[]): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_meeting_templates").upsert(
      { group_code: group, blocks, updated_at: now() },
      { onConflict: "group_code" },
    );
    if (error) throw new Error(error.message);
    return;
  }
  mem.templates.set(group, blocks);
}

// ---------------------------------------------------------------- meetings
export async function listMeetings(group: ProjectGroup): Promise<Meeting[]> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("lms_meetings").select("*").eq("group_code", group)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }
  return mem.meetings
    .filter((m) => m.group === group)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.createdAt.localeCompare(a.createdAt));
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_meetings").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data) : null;
  }
  return mem.meetings.find((m) => m.id === id) ?? null;
}

/** Create a new meeting, seeded from the group's template. */
export async function createMeeting(
  group: ProjectGroup,
  createdBy: string,
  fields: { title?: string; date?: string | null; location?: string; attendees?: string[] },
): Promise<Meeting> {
  const tpl = await getTemplate(group);
  // fresh ids for the copied template blocks
  const blocks = tpl.blocks.map((b) => ({ ...b, id: uid() }));
  const row = {
    id: uid(),
    group_code: group,
    title: fields.title?.trim() || "",
    meeting_date: fields.date ?? new Date().toISOString().slice(0, 10),
    location: fields.location ?? "",
    notetaker: "",
    snack: "",
    attendees: fields.attendees ?? [],
    blocks,
    created_by: lc(createdBy),
    created_at: now(),
    updated_at: now(),
  };
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_meetings").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  }
  const m = fromRow(row);
  mem.meetings.push(m);
  return m;
}

export type MeetingPatch = Partial<
  Pick<Meeting, "title" | "date" | "location" | "notetaker" | "snack" | "attendees" | "blocks">
>;

export async function updateMeeting(id: string, patch: MeetingPatch): Promise<Meeting | null> {
  if (usingSupabase) {
    const row: Record<string, unknown> = { updated_at: now() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.date !== undefined) row.meeting_date = patch.date;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.notetaker !== undefined) row.notetaker = patch.notetaker;
    if (patch.snack !== undefined) row.snack = patch.snack;
    if (patch.attendees !== undefined) row.attendees = patch.attendees;
    if (patch.blocks !== undefined) row.blocks = patch.blocks;
    const { data, error } = await sb().from("lms_meetings").update(row).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data) : null;
  }
  const m = mem.meetings.find((x) => x.id === id);
  if (!m) return null;
  Object.assign(m, patch, { updatedAt: now() });
  return m;
}

export async function deleteMeeting(id: string): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_meetings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  mem.meetings = mem.meetings.filter((m) => m.id !== id);
}
