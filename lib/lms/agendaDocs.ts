import type { ProjectGroup } from "@/lib/lms/types";

/**
 * The 2026-2027 agenda doc for each project group, shown on the meeting page in
 * place of the old rich-text editor.
 *
 * Ids are the Drive file ids of the docs under
 * "2026-2027 Project RISHI / Project Groups / <group>". WatSan has no 26-27
 * agenda doc yet — when one is created, drop its id in and it appears
 * automatically.
 */
export const AGENDA_DOCS: Record<ProjectGroup, { id: string; name: string } | null> = {
  E: { id: "1LvhmlFo_cNc1zOoptraoWoVCMMoHLz18IWTeaAjxSNE", name: "Education Agendas: Fall 2026-Spring 2027" },
  H: { id: "1Rwns838OlBa-eGSqZLzvoGjua5CvKYOueaW554f03dM", name: "Health Agenda 26-27" },
  W: { id: "1k4er3MsNe22EoO60NB-T2nOL-jVSzql_2mJoCE-69AU", name: "Women's Meeting Agenda 26-27" },
  R: null, // WatSan — no 26-27 agenda doc in Drive yet
};

/** Who is recorded as the assigner for tasks migrated out of each agenda doc. */
export const AGENDA_TASK_ASSIGNER: Record<ProjectGroup, string | null> = {
  E: "megha_ramachandran@berkeley.edu", // Megha
  W: "palakprabhakar1@berkeley.edu",    // Palak
  H: "krrishikasaxena@berkeley.edu",    // Krrishika
  R: null,                              // Ria — WatSan, pending a doc
};
