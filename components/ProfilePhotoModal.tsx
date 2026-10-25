"use client";

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

const OUT_SIZE = 256; // exported avatar is 256x256

// Draw the chosen crop area onto a square canvas and return a JPEG data URL.
async function cropToDataUrl(src: string, area: Area): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Couldn't load that image."));
    i.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = OUT_SIZE;
  canvas.height = OUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, OUT_SIZE, OUT_SIZE,
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function ProfilePhotoModal({
  currentAvatar,
  onClose,
  onSaved,
}: {
  currentAvatar: string | null;
  onClose: () => void;
  onSaved: (avatar: string | null) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setAreaPixels(pixels), []);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => { setSrc(reader.result as string); setZoom(1); setCrop({ x: 0, y: 0 }); };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!src || !areaPixels) return;
    setBusy(true); setErr(null);
    try {
      const dataUrl = await cropToDataUrl(src, areaPixels);
      const res = await fetch("/api/lms/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save your photo.");
      onSaved(data.avatar ?? dataUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/lms/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: null }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || "Couldn't remove your photo."); }
      onSaved(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 safe-overlay" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-semibold text-pine-deep">Profile photo</h3>
        <p className="mt-1 text-sm text-ink/75">Choose a photo, then drag and zoom to frame it.</p>

        <div className="relative mt-5 h-64 w-full overflow-hidden rounded-2xl bg-ink/5">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="grid h-full w-full place-items-center text-sm font-semibold text-pine hover:bg-pine/[0.04]"
            >
              Click to choose a photo
            </button>
          )}
        </div>

        {src && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs font-medium text-ink/70">Zoom</span>
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-marigold"
            />
            <button onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-pine underline">
              Change
            </button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            {currentAvatar && (
              <button
                onClick={removePhoto}
                disabled={busy}
                className="text-sm font-semibold text-red-600/80 hover:text-red-600 disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !src || !areaPixels}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
