import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { getTask } from "@/lib/lms/store";
import { canManageTask } from "@/lib/lms/permissions";
import { findMember } from "@/lib/members";
import {
  createTaskUpload,
  purgeTaskUploads,
  deleteTaskUpload,
  listTaskFiles,
  taskFolderGroup,
  MAX_UPLOAD_BYTES,
} from "@/lib/lms/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Everyone involved in the task can see its attachments; only the doer adds them. */
async function load(id: string) {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  const task = await getTask(id);
  if (!task) return { error: "Task not found", status: 404 as const };
  const isAssignee = task.assigneeEmail.toLowerCase() === me.email.toLowerCase();
  const canView = isAssignee || canManageTask(me, task);
  if (!canView) return { error: "Not authorized", status: 403 as const };
  return { me, task, isAssignee };
}

/** GET — the files attached to this task (shared across all its assignees). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await load(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    return NextResponse.json({ files: await listTaskFiles(g.task.groupId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST a multipart form with `file` — attaches it to this task's submission. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await load(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { me, task, isAssignee } = g;

  if (!isAssignee)
    return NextResponse.json(
      { error: "Only the person the task is assigned to can attach a file." },
      { status: 403 },
    );
  if (task.status === "complete")
    return NextResponse.json(
      { error: "This task is already approved — its submission is closed." },
      { status: 400 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      { error: `Files have to be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );

  try {
    // One file per person per task. A task sent back for revision keeps its old
    // attachment until a new one arrives, then the new one REPLACES it — bytes
    // and all — so a manager is never choosing between two versions.
    await purgeTaskUploads(task.groupId, me.email).catch(() => {});

    const node = await createTaskUpload({
      taskGroupId: task.groupId,
      taskTitle: task.title,
      group: taskFolderGroup(findMember(task.assignerEmail) ?? null, findMember(task.assigneeEmail) ?? null),
      name: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      uploadedBy: me.email.toLowerCase(),
    });
    return NextResponse.json({ ok: true, file: node });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** DELETE ?fileId=… — take back an attachment while the task is still open. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const g = await load(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const fileId = new URL(req.url).searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    await deleteTaskUpload(g.me, fileId, g.task.status === "complete");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
