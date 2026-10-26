// The home page's live landscape: dawn over the Himalayan foothills around a
// terraced hillside village. Loaded only on the home page, only in the browser,
// and only after the page has painted (see FoothillsBackdrop.tsx).
//
// Scroll drives one thing: `progress` 0 → 1. The camera glides from a high,
// wide view of the ranges at sunrise down the valley to the terraces, and the
// light warms into morning on the way. The camera catches up with the scroll
// in a fraction of a second, so fast scrolling is never held back.
//
// Cost control: no shadows, no post-processing, Lambert lighting, instanced
// trees and houses, capped pixel ratio, fewer vertices on phones, renders only
// when something changed (plus ~30 fps for mist and birds), and stops when the
// tab is hidden. If frames run slow it lowers its own resolution.

import * as THREE from "three";
import { height, mix, buildSheet, placePines, placeHouses, placeMist } from "./terrain";

export type Foothills = { setProgress: (p: number) => void; dispose: () => void; firstFrame: Promise<void> };

type LandData = {
  main: ReturnType<typeof buildSheet>; village: ReturnType<typeof buildSheet>;
  pines: Float32Array; shade: Float32Array; houses: Float32Array; mist: Float32Array;
};

/** Build the land data in a Web Worker; fall back to doing it here if workers aren't available. */
function landData(small: boolean): Promise<LandData> {
  return new Promise((resolve) => {
    const inline = () => {
      const main = buildSheet(0, -900, 3400, 3400, small ? 170 : 280, 3);
      const village = buildSheet(30, -270, 560, 560, small ? 150 : 230, 0);
      const { pines, shade } = placePines(small ? 700 : 1800);
      resolve({ main, village, pines, shade, houses: placeHouses(small ? 34 : 56), mist: placeMist(small ? 26 : 46) });
    };
    try {
      const w = new Worker(new URL("./terrain.worker.ts", import.meta.url));
      w.onmessage = (e: MessageEvent<LandData>) => { resolve(e.data); w.terminate(); };
      w.onerror = () => { w.terminate(); inline(); };
      w.postMessage({ small });
    } catch { inline(); }
  });
}

/** A terrain sheet from worker data (same vertex layout as PlaneGeometry). */
function sheetMesh(cx: number, cz: number, w: number, d: number, sh: LandData["main"]) {
  const g = new THREE.PlaneGeometry(w, d, sh.segX, sh.segZ);
  g.rotateX(-Math.PI / 2);
  // Same vertex order as the worker's grid: rows from far (−z) to near, x left to right.
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + cx, sh.heights[i], pos.getZ(i) + cz);
  g.setAttribute("color", new THREE.BufferAttribute(sh.colors, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

const C = (hex: string) => new THREE.Color(hex);

// ---- sky -------------------------------------------------------------------------
const SKY = {
  dawn: { top: C("#8fb0d0"), horizon: C("#f6cfa8"), sun: C("#ffc77a") },
  morning: { top: C("#76a7d6"), horizon: C("#e3edf1"), sun: C("#fff3d6") },
};

function skyMesh() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: SKY.dawn.top.clone() }, horizon: { value: SKY.dawn.horizon.clone() },
      sunCol: { value: SKY.dawn.sun.clone() }, sunDir: { value: new THREE.Vector3(0, 0.05, -1).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(s, 900.0) * 1.6 + pow(s, 40.0) * 0.28 + pow(s, 6.0) * 0.12);
        col = mix(col, horizon, smoothstep(0.0, -0.08, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), mat);
}

// ---- trees, houses, mist, birds ---------------------------------------------------
function pineGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5); trunk.translate(0, 0.6, 0); parts.push(trunk);
  [[1.0, 2.2, 1.7], [0.78, 1.9, 2.9], [0.52, 1.6, 4.0]].forEach(([r, hgt, y]) => {
    const cone = new THREE.ConeGeometry(r, hgt, 7); cone.translate(0, y, 0); parts.push(cone);
  });
  // merge by hand (no addons): concatenate non-indexed geometries
  const flat = parts.map((p) => p.toNonIndexed());
  const n = flat.reduce((s, p) => s + p.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of flat) { pos.set(p.attributes.position.array as Float32Array, o * 3); nor.set(p.attributes.normal.array as Float32Array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}

function softTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.45, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function bird() {
  const g = new THREE.Group();
  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, -0.6, 0, 0, 0.6, 3.2, 0.3, 0.2]), 3));
  wing.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: "#3d4a4f", side: THREE.DoubleSide, fog: true });
  const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
  r.scale.x = -1; g.add(l, r);
  return { g, l, r };
}

// ---- camera route -------------------------------------------------------------------
const ROUTE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 240, 560), new THREE.Vector3(-150, 175, 270),
  new THREE.Vector3(-55, 125, 30), new THREE.Vector3(55, 100, -125),
]);
const LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 160, -1200), new THREE.Vector3(20, 90, -460),
  new THREE.Vector3(30, 52, -285), new THREE.Vector3(26, 56, -305),
]);

// ---- build ------------------------------------------------------------------------------
export function createFoothills(canvas: HTMLCanvasElement, options: { reduced: boolean; small: boolean }): Foothills {
  let opts = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.small, powerPreference: "high-performance" });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, opts.small ? 1 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(SKY.dawn.horizon.clone(), 260, 2600);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(46, 1, 1, 8000);

  const sky = skyMesh(); scene.add(sky);
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
  const hemi = new THREE.HemisphereLight("#cfe0ee", "#4a6a3e", 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffd29a", 1.6); scene.add(sun);

  const tex = softTexture();
  const mist: { s: THREE.Sprite; x: number; ph: number }[] = [];
  const flock: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; off: THREE.Vector3; ph: number }[] = [];
  let disposed = false;

  // ---- assemble the land once the worker has built it ------------------------------
  const assemble = (d: LandData) => {
    scene.add(sheetMesh(0, -900, 3400, 3400, d.main));
    scene.add(sheetMesh(30, -270, 560, 560, d.village));

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);

    const np = d.pines.length / 6;
    const pines = new THREE.InstancedMesh(pineGeometry(), new THREE.MeshLambertMaterial({ color: "#ffffff" }), np);
    for (let k = 0; k < np; k++) {
      const o = k * 6;
      q.setFromAxisAngle(up, d.pines[o + 3]);
      m4.compose(p3.set(d.pines[o], d.pines[o + 1], d.pines[o + 2]), q, s3.set(d.pines[o + 4], d.pines[o + 5], d.pines[o + 4]));
      pines.setMatrixAt(k, m4);
      pines.setColorAt(k, col.set("#2f5a36").offsetHSL(d.shade[k] * 0.2, 0, d.shade[k] * 0.5));
    }
    scene.add(pines);

    // the village: whitewashed and stone houses with slate roofs on the terraces
    const nh = d.houses.length / 8;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#ffffff" }), nh);
    const roofGeo = new THREE.ConeGeometry(0.78, 1, 4); roofGeo.rotateY(Math.PI / 4);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: "#5b676e" }), nh);
    const wallCols = ["#efe6d2", "#e7dcc6", "#d9d2c4", "#c9c2b5", "#eadfca"];
    for (let k = 0; k < nh; k++) {
      const o = k * 8, [x, gy, z, rot, w, hh, dd, ci] = Array.from(d.houses.subarray(o, o + 8));
      q.setFromAxisAngle(up, rot);
      m4.compose(p3.set(x, gy + hh / 2 - 0.5, z), q, s3.set(w, hh, dd)); walls.setMatrixAt(k, m4);
      walls.setColorAt(k, col.set(wallCols[ci | 0]));
      const rh = Math.max(w, dd) * 0.45;
      m4.compose(p3.set(x, gy + hh - 0.5 + rh / 2, z), q, s3.set(w * 1.15, rh, dd * 1.15)); roofs.setMatrixAt(k, m4);
    }
    scene.add(walls, roofs);

    // morning mist lying in the valleys
    for (let k = 0; k < d.mist.length / 5; k++) {
      const o = k * 5;
      const mat = new THREE.SpriteMaterial({ map: tex, color: "#fbf3ea", transparent: true, opacity: d.mist[o + 4], depthWrite: false, fog: true });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(d.mist[o + 3] * 1.8, d.mist[o + 3] * 0.55, 1);
      sp.position.set(d.mist[o], d.mist[o + 1], d.mist[o + 2]);
      scene.add(sp); mist.push({ s: sp, x: d.mist[o], ph: k * 1.37 });
    }

    // a small flock crossing the valley
    for (let k = 0; k < (opts.small ? 6 : 9); k++) {
      const b = bird(); b.g.scale.setScalar(2.2); scene.add(b.g);
      flock.push({ ...b, off: new THREE.Vector3((k % 3) * 14 - 14, Math.floor(k / 3) * 6 + (k % 2) * 3, Math.floor(k / 3) * 12), ph: k * 0.7 });
    }
  };

  // ---- per-frame state ---------------------------------------------------------------
  let target = 0, cur = 0, dirty = true, lastAmbient = 0, raf = 0, ready = false;
  const t0 = performance.now();
  const sunDir = new THREE.Vector3(), look = new THREE.Vector3();
  const horizon = new THREE.Color(), top = new THREE.Color(), sunC = new THREE.Color();

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); dirty = true;
  };
  resize();
  window.addEventListener("resize", resize);

  const apply = (p: number) => {
    ROUTE.getPoint(p, camera.position); LOOK.getPoint(p, look);
    camera.position.y = Math.max(camera.position.y, height(camera.position.x, camera.position.z).h + 32);
    camera.lookAt(look);
    // sunrise: low and peach at the top of the page, higher and clearer below
    sunDir.set(-0.25, mix(0.02, 0.36, p), -1).normalize();
    horizon.copy(SKY.dawn.horizon).lerp(SKY.morning.horizon, p);
    top.copy(SKY.dawn.top).lerp(SKY.morning.top, p);
    sunC.copy(SKY.dawn.sun).lerp(SKY.morning.sun, p);
    skyU.horizon.value.copy(horizon); skyU.top.value.copy(top); skyU.sunCol.value.copy(sunC); skyU.sunDir.value.copy(sunDir);
    fog.color.copy(horizon);
    sun.position.copy(sunDir).multiplyScalar(1000); sun.color.copy(sunC); sun.intensity = mix(1.25, 2.0, p);
    hemi.intensity = mix(0.75, 1.05, p);
    sky.position.copy(camera.position);
  };

  const ambient = (t: number) => {
    const s = (t - t0) / 1000;
    for (const m of mist) m.s.position.x = m.x + Math.sin(s * 0.05 + m.ph) * 40;
    const c = new THREE.Vector3(-40 + Math.sin(s * 0.06) * 260, 205, -160 + Math.cos(s * 0.06) * 200);
    const heading = Math.atan2(Math.cos(s * 0.06) * 0.06 * 260, -Math.sin(s * 0.06) * 0.06 * 200);
    for (const b of flock) {
      b.g.position.copy(c).add(b.off);
      b.g.rotation.y = heading;
      const flap = Math.sin(s * 7 + b.ph) * 0.55;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
    }
  };

  let resolveFirst: () => void = () => {};
  const firstFrame = new Promise<void>((r) => (resolveFirst = r));
  let slow = 0, frames = 0, lastT = 0, verySlow = 0, quality = 2, frozen = false, drewLast = false, lastDrawT = 0;
  const degrade = () => {
    if (quality === 1) { opts = { ...opts, reduced: true }; pixelRatio = 0.6; renderer.setPixelRatio(pixelRatio); resize(); }
    if (quality === 0) frozen = true; // keep the last frame on screen
  };

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (!ready || frozen || document.hidden) return;
    if (drewLast && lastDrawT && !(window as Window & { __FOOTHILLS_DEBUG__?: boolean }).__FOOTHILLS_DEBUG__) {
      if (t - lastDrawT > 160) { if (++verySlow >= 2) { quality = Math.max(0, quality - 1); verySlow = 0; degrade(); if (frozen) return; } }
      else verySlow = 0;
    }
    drewLast = false;
    const moving = Math.abs(target - cur) > 0.0002;
    if (moving) cur += (target - cur) * 0.18; // catches up with the scroll in ~0.25s
    const ambientDue = !opts.reduced && !(window as Window & { __FOOTHILLS_STILL__?: boolean }).__FOOTHILLS_STILL__ && t - lastAmbient > 33;
    if (!moving && !ambientDue && !dirty) return;
    if (ambientDue) { lastAmbient = t; ambient(t); }
    apply(cur);
    renderer.render(scene, camera);
    lastDrawT = t;
    if (dirty) { if (!lastT) performance.mark("foothills:first-frame"); dirty = false; resolveFirst(); }
    // Self-tuning. Mildly slow → lower resolution. Badly slow (a weak or
    // software GPU) → drop the ambient mist and birds, then stop on a still
    // frame. Scrolling the page must never be held up by the scene.
    // The browser finishes drawing after render() returns, so the honest measure
    // is the gap until the next frame arrives after one we drew.
    // (window.__FOOTHILLS_DEBUG__ lets automated visual checks on GPU-less test machines see every frame)
    drewLast = true;
    if (lastT) { frames++; if (t - lastT > 40) slow++; }
    lastT = t;
    if (frames === 90) {
      if (slow > 30 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio * 0.7); renderer.setPixelRatio(pixelRatio); resize(); }
      frames = slow = 0;
    }
  };

  // performance.mark()s are left in on purpose: they show up in DevTools'
  // Performance panel as "foothills:*" and cost nothing.
  performance.mark("foothills:start");
  void landData(opts.small).then(async (d) => {
    if (disposed) return;
    performance.mark("foothills:land-built");
    assemble(d);
    performance.mark("foothills:assembled");
    cur = target; apply(cur);
    if (!opts.reduced) ambient(performance.now());
    // compile shaders without blocking the page (parallel compile where supported)
    try { await renderer.compileAsync(scene, camera); } catch { /* compile on first render instead */ }
    performance.mark("foothills:compiled");
    if (disposed) return;
    ready = true; dirty = true;
    raf = requestAnimationFrame(loop);
  });

  return {
    firstFrame,
    setProgress: (p: number) => { target = Math.min(1, Math.max(0, p)); },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((mm) => mm.dispose());
      });
      tex.dispose();
      renderer.dispose();
    },
  };
}
