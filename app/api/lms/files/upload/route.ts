import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { createUpload, deleteUpload, MAX_UPLOAD_BYTES } from "@/lib/lms/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** POST a multipart form: `file` (the blob) + `folder` (the folder's id). */
export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const folder = String(form.get("folder") ?? "");
  const file = form.get("file");
  if (!folder) return NextResponse.json({ error: "Pick a folder to upload into." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "No file attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      { error: `Files have to be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Put larger ones in Drive instead.` },
      { status: 413 },
    );

  try {
    const node = await createUpload(me, {
      folderKey: folder,
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

/** DELETE ?id=…  — uploads only; Drive-mirrored files are managed in Drive. */
export async function DELETE(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    await deleteUpload(me, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
