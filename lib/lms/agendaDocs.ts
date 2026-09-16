import type { ProjectGroup } from "@/lib/lms/types";

/**
 * The 2026-2027 agenda doc for each project group, shown on the meeting page in
 * place of the old rich-text editor.
 *
 * Ids are the Drive file ids of the docs under
 * "2026-2027 Project RISHI / Project Groups / <group>".
 *
 * These are the MAIN documents, deliberately — the meeting page embeds what
 * people actually edit. The separate "Website-Friendly" copies exist only so
 * the task importer can read statuses, and are never embedded.
 */
export const AGENDA_DOCS: Record<ProjectGroup, { id: string; name: string } | null> = {
  E: { id: "1LvhmlFo_cNc1zOoptraoWoVCMMoHLz18IWTeaAjxSNE", name: "Education Agendas: Fall 2026-Spring 2027" },
  H: { id: "1Rwns838OlBa-eGSqZLzvoGjua5CvKYOueaW554f03dM", name: "Health Agenda 26-27" },
  W: { id: "1k4er3MsNe22EoO60NB-T2nOL-jVSzql_2mJoCE-69AU", name: "Women's Meeting Agenda 26-27" },
  R: { id: "1dyxBP-lOKb5k_mI5FgbhP1hH9s34gAE6cRBFpEygHyI", name: "WatSan Agenda 2026-2027" },
};

/** Who is recorded as the assigner for tasks migrated out of each agenda doc. */
export const AGENDA_TASK_ASSIGNER: Record<ProjectGroup, string | null> = {
  E: "megha_ramachandran@berkeley.edu", // Megha
  W: "palakprabhakar1@berkeley.edu",    // Palak
  H: "krrishikasaxena@berkeley.edu",    // Krrishika
  R: "riaprathinidhi1@berkeley.edu",     // Ria
};
