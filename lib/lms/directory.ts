// ============================================================================
//  Member directory — a club-wide table of everyone's name, role, email, phone.
// ----------------------------------------------------------------------------
//  Email and phone default to what's in members.ts, but each member may override
//  THEIR OWN contact email / phone for the directory only. Overrides live in
//  lms_contact_overrides and never affect the login email or anything in
//  members.ts.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MEMBERS, memberFullName, memberRoleLabel, memberYear } from "@/lib/members";
import { PROJECT_GROUP_LABELS } from "@/lib/lms/types";
import { formatPhone } from "@/lib/lms/phone";

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

const lc = (e: string) => e.trim().toLowerCase();

export type ContactOverride = { contactEmail: string | null; phone: string | null };
export type DirectoryEntry = {
  loginEmail: string; // stable identity (never changes)
  name: string;
  role: string;
  group: string;
  email: string; // override ?? members.ts email
  phone: string; // override ?? members.ts phone ?? ""
  year: string; // year at Berkeley ("" = not specified)
  positionCategory: string; // bucket for filtering (role label, or "General Member")
  positionRank: number; // custom directory order (lower = higher up)
};

// The order positions appear in the directory (NOT a real hierarchy — just the
// requested display order). Matches the labels memberRoleLabel produces.
export const POSITION_ORDER = [
  "President",
  "VP Internal",
  "VP of Projects",
  "NMT Leader",
  "Director of International Affairs",
  "Director of Finance",
  "Director of Outreach",
  "Education Lead",
  "Health Lead",
  "Water & Sanitation Lead",
  "Women's Empowerment Lead",
] as const;

const GENERAL = "General Member";
function positionRank(label: string): number {
  const i = (POSITION_ORDER as readonly string[]).indexOf(label);
  return i === -1 ? POSITION_ORDER.length : i;
}
function positionCategory(label: string): string {
  return (POSITION_ORDER as readonly string[]).includes(label) ? label : GENERAL;
}

// In-memory fallback, keyed by login email.
const mem = new Map<string, ContactOverride>();

async function allOverrides(): Promise<Map<string, ContactOverride>> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_contact_overrides").select("*");
    if (error) throw new Error(error.message);
    const m = new Map<string, ContactOverride>();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const r of (data ?? []) as any[]) {
      m.set(lc(r.email), { contactEmail: r.contact_email ?? null, phone: r.phone ?? null });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return m;
  }
  return new Map(mem);
}

export async function getContactOverride(email: string): Promise<ContactOverride | null> {
  const overrides = await allOverrides();
  return overrides.get(lc(email)) ?? null;
}

/** Update the current member's directory contact info. Empty string clears the
 *  override for that field (reverts to the members.ts default). */
export async function setContactOverride(
  email: string,
  next: { contactEmail?: string; phone?: string },
): Promise<void> {
  const key = lc(email);
  const contactEmail = next.contactEmail !== undefined ? next.contactEmail.trim() || null : undefined;
  const phone = next.phone !== undefined ? next.phone.trim() || null : undefined;

  if (usingSupabase) {
    const existing = (await getContactOverride(email)) ?? { contactEmail: null, phone: null };
    const row = {
      email: key,
      contact_email: contactEmail !== undefined ? contactEmail : existing.contactEmail,
      phone: phone !== undefined ? phone : existing.phone,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb().from("lms_contact_overrides").upsert(row, { onConflict: "email" });
    if (error) throw new Error(error.message);
    return;
  }
  const existing = mem.get(key) ?? { contactEmail: null, phone: null };
  mem.set(key, {
    contactEmail: contactEmail !== undefined ? contactEmail : existing.contactEmail,
    phone: phone !== undefined ? phone : existing.phone,
  });
}

/** The full club directory (excludes hidden test accounts). */
export async function listDirectory(): Promise<DirectoryEntry[]> {
  const overrides = await allOverrides();
  return MEMBERS.filter((m) => !m.hidden)
    .map((m) => {
      const o = overrides.get(lc(m.email));
      const role = memberRoleLabel(m);
      return {
        loginEmail: lc(m.email),
        name: memberFullName(m),
        role,
        group: PROJECT_GROUP_LABELS[m.group],
        email: o?.contactEmail ?? m.email,
        phone: formatPhone(o?.phone ?? m.phone ?? ""),
        year: memberYear(m.email),
        positionCategory: positionCategory(role),
        positionRank: positionRank(role),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
