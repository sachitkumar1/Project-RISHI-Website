// Turns the terrain height images into geometry off the main thread, so the
// page stays fully scrollable while the 3D aerial scene is prepared.
import { REGIONS, build } from "./aerialData";

self.onmessage = async (e: MessageEvent<{ small: boolean }>) => {
  try {
    const steps = e.data.small ? { detail: 2, mid: 2, far: 2 } : { detail: 1, mid: 1, far: 1 };
    const built = await Promise.all(REGIONS.map((r) => build(r, steps[r.name])));
    const transfer = built.flatMap((b) => [b.positions.buffer, b.index.buffer, b.heights.buffer]);
    (self as unknown as Worker).postMessage({ ok: true, built }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
