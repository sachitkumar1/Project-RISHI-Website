// The home page's live backdrop: real photographs of the Himalayan foothills,
// each given depth so the camera can move *into* the picture.
//
// Every photo is a finely divided sheet pushed out to the depth estimated for
// each pixel (scripts/landscape/prepare_photos.py). Seen from where the photo
// was taken it is exactly the photograph; as the camera moves, near ground
// slides past faster than far ridges, as it would from a drone. Scroll drives
// the camera and the hand-over between shots; a valley mist drifts through,
// birds cross the sky, and as each shot arrives the lens pulls focus from the
// distance onto the foreground.
//
// Cost control: one textured sheet per visible shot (two during a dissolve),
// no lighting, capped pixel ratio, ~30 fps ambient animation, nothing drawn
// while the tab is hidden, and a watchdog that hands back to the plain photo
// layer if frames come too slowly. Loaded only on the home page, after paint.

import * as THREE from "three";
import { SHOTS, shotWeights, shotDepth, overscan, type Shot } from "./shots";

export type Journey = {
  setPosition: (pos: number) => void;
  /** a shot's photo URL, chosen by the photo layer (so both share one download) */
  load: (index: number, photoUrl: string) => void;
  dispose: () => void;
  firstFrame: Promise<void>;
  /** called if the device turns out too slow: the page shows the photo layer instead */
  onGiveUp: (cb: () => void) => void;
};

const NEAR = 10;

const vertex = /* glsl */ `
  uniform sampler2D depthMap;
  uniform vec2 halfSize;    // half-size of the photo on the z = -1 plane
  uniform vec2 offset;      // framing offset on that plane
  uniform float nearDisp;   // 1 / nearest distance
  uniform float farDisp;    // 1 / farthest distance
  uniform float time;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = vec2(uv.x, 1.0 - uv.y);   // images are uploaded top row first
    float d = texture2D(depthMap, vUv).r;
    vDepth = d;
    float dist = 1.0 / mix(farDisp, nearDisp, d);
    vec3 dir = vec3((uv - 0.5) * 2.0 * halfSize + offset, -1.0);
    vec3 p = dir * dist;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D map;
  uniform float alpha;
  uniform float time;
  uniform float mist;       // the shot's valley mist
  uniform float veil;       // extra mist while shots dissolve
  uniform float focusBlur;  // foreground out of focus (lens pulling focus)
  uniform vec3 mistColor;
  uniform vec2 drift;
  varying vec2 vUv;
  varying float vDepth;
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.02 + 7.1; a *= 0.5; } return s; }
  void main() {
    // depth of field: nearer ground is softer while focus is on the distance
    float near = smoothstep(0.45, 0.95, vDepth);
    vec4 c = texture2D(map, vUv, focusBlur * near * 3.2);
    vec3 col = c.rgb;
    // valley mist: drifting banks, thickest in the far distance and low in the frame
    vec2 q = vec2(vUv.x * 2.4, vUv.y * 4.0);
    float banks = fbm(q + drift * time * 0.012 + vec2(0.0, sin(time * 0.05) * 0.2));
    banks = smoothstep(0.42, 0.85, banks + 0.12 * fbm(q * 3.0 - time * 0.02));
    float far = pow(1.0 - vDepth, 1.6);
    float m = clamp(mist * banks * (0.25 + 0.75 * far) + veil * (0.55 + 0.45 * banks), 0.0, 0.92);
    col = mix(col, mistColor, m);
    // a little aerial haze on the farthest ridges
    col = mix(col, mistColor, far * 0.08 * mist);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/** Sheet for one photo: divided finely enough that ridgelines and roofs keep their shape. */
function sheet(segX: number, segY: number) {
  return new THREE.PlaneGeometry(1, 1, segX, segY);
}

function bird() {
  const g = new THREE.Group();
  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, -0.5, 0, 0, 0.5, 3.0, 0.35, 0.1]), 3));
  const mat = new THREE.MeshBasicMaterial({ color: "#2b3236", side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
  r.scale.x = -1; g.add(l, r);
  return { g, l, r, mat };
}

export function createJourney(canvas: HTMLCanvasElement, options: { small: boolean }): Journey {
  const small = options.small;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1000);
  const fovHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ premultiplyAlpha: "none" });

  type Live = { shot: Shot; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; scene: THREE.Scene; ready: boolean };
  const geo = sheet(small ? 160 : 288, small ? 120 : 200);
  const live: (Live | null)[] = SHOTS.map(() => null);
  const pending = new Map<number, Promise<void>>();

  // birds share one scene and are drawn over the photo they belong to
  const birdScene = new THREE.Scene();
  const flock = Array.from({ length: small ? 5 : 7 }, (_, k) => {
    const b = bird(); b.g.scale.setScalar(0.5); birdScene.add(b.g);
    return { ...b, off: new THREE.Vector3((k % 3) * 3.2 - 3, Math.floor(k / 3) * 1.4 + (k % 2) * 0.7, Math.floor(k / 3) * 2.5), ph: k * 0.9 };
  });

  let disposed = false, dirty = true, raf = 0;
  let target = 0, cur = 0, lastAmbient = 0, t0 = performance.now();
  let giveUp: () => void = () => {};
  let resolveFirst: () => void = () => {};
  const firstFrame = new Promise<void>((r) => (resolveFirst = r));

  const load = (index: number, photoUrl: string) => {
    if (live[index] || pending.has(index) || disposed) return;
    const shot = SHOTS[index];
    const tex = (url: string) => new Promise<THREE.Texture>((res, rej) =>
      loader.load(url, (bmp) => {
        const t = new THREE.Texture(bmp as unknown as HTMLImageElement);
        t.flipY = false; t.needsUpdate = true;
        res(t);
      }, undefined, rej));
    const job = Promise.all([tex(photoUrl), tex(shotDepth(shot.name))]).then(([map, depthMap]) => {
      if (disposed) { map.dispose(); depthMap.dispose(); return; }
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, maxAniso);
      map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
      depthMap.colorSpace = THREE.NoColorSpace;
      depthMap.generateMipmaps = false; depthMap.minFilter = THREE.LinearFilter;
      const mat = new THREE.ShaderMaterial({
        vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: true,
        uniforms: {
          map: { value: map }, depthMap: { value: depthMap },
          halfSize: { value: new THREE.Vector2(1, 1) }, offset: { value: new THREE.Vector2() },
          nearDisp: { value: 1 / NEAR }, farDisp: { value: 1 / (NEAR * shot.depthRatio) },
          alpha: { value: 1 }, time: { value: 0 }, mist: { value: shot.mist }, veil: { value: 0 }, focusBlur: { value: 0 },
          mistColor: { value: new THREE.Color("#eef1f0") }, drift: { value: new THREE.Vector2(index % 2 ? -1 : 1, 0.3) },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      const scene = new THREE.Scene(); scene.add(mesh);
      live[index] = { shot, mesh, mat, scene, ready: true };
      frame(); // fit to the screen
      // upload now (not on the first frame that needs it) so the dissolve never hitches
      renderer.initTexture(map); renderer.initTexture(depthMap);
      dirty = true;
    }).catch(() => { /* the photo layer keeps showing this shot */ });
    pending.set(index, job);
  };

  // Fit a shot to the screen like CSS `object-fit: cover`, with enough
  // overscan that camera moves never reveal its edges.
  const frame = () => {
    const A = camera.aspect;
    for (const l of live) {
      if (!l) continue;
      const { shot } = l;
      const over = overscan(shot);
      const halfH = Math.max(fovHalf * over, (fovHalf * A * over) / shot.aspect);
      const halfW = halfH * shot.aspect;
      // spare photo beyond the screen, shared out like CSS object-position
      const spareX = Math.max(0, halfW - fovHalf * A * over), spareY = Math.max(0, halfH - fovHalf * over);
      const offX = (0.5 - shot.focusX) * 2 * spareX;
      const offY = (shot.focusY - 0.5) * 2 * spareY;
      l.mat.uniforms.halfSize.value.set(halfW, halfH);
      l.mat.uniforms.offset.value.set(offX, offY);
    }
  };

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    frame(); dirty = true;
  };
  resize();
  window.addEventListener("resize", resize);

  // camera inside shot k at progress t (−0.3 … 1), plus a slow hand-held float
  const pose = (shot: Shot, t: number, s: number) => {
    const e = t < 0 ? t : 1 - Math.pow(1 - t, 1.6); // eases out: arrives briskly, settles in
    camera.position.set(
      shot.driftX * NEAR * e + Math.sin(s * 0.13) * 0.025,
      shot.driftY * NEAR * e + Math.sin(s * 0.17 + 1.3) * 0.018,
      -shot.push * NEAR * e,
    );
    camera.rotation.set(Math.sin(s * 0.11) * 0.0015, Math.sin(s * 0.09) * 0.002, 0);
  };

  let still = false;
  const draw = (now: number) => {
    const s = (now - t0) / 1000;
    renderer.clear();
    const weights = shotWeights(cur, SHOTS.length);
    let drew = false;
    for (const w of weights) {
      const l = live[w.index];
      if (!l) continue;
      pose(l.shot, w.t, still ? 0 : s);
      const u = l.mat.uniforms;
      u.alpha.value = drew ? w.alpha : 1; // the first shot drawn is always opaque
      u.time.value = still ? 0 : s;
      // the hand-over: the incoming shot rises out of a bank of mist
      u.veil.value = weights.length > 1 ? (w.index === weights[0].index ? 0.26 : 0.32) * Math.sin(Math.PI * weights[1].alpha) : 0;
      // rack focus: the foreground starts soft and sharpens as the shot settles
      u.focusBlur.value = 1 - THREE.MathUtils.smoothstep(w.t, -0.3, 0.08);
      renderer.clearDepth();
      renderer.render(l.scene, camera);
      if (l.shot.birds && w.alpha > 0.5) drawBirds(s, w.t);
      drew = true;
    }
    return drew;
  };

  const drawBirds = (s: number, t: number) => {
    // a loose flock gliding across the upper sky, far off
    const cx = -60 + ((s * 2.2) % 120), cy = 6.5 + Math.sin(s * 0.3) * 0.6, cz = -60 + t * 4;
    for (const b of flock) {
      b.g.position.set(cx + b.off.x, cy + b.off.y, cz + b.off.z);
      b.g.rotation.set(0, Math.PI / 2 + 0.25, 0);
      const flap = Math.sin(s * 6.5 + b.ph) * 0.6;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
    }
    renderer.clearDepth();
    renderer.render(birdScene, camera);
  };

  // ---- loop + watchdog --------------------------------------------------------
  let lastDrawT = 0, slowStrikes = 0, frames = 0, slowFrames = 0, gaveUp = false;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (disposed || gaveUp || document.hidden) return;
    const dbg = window as Window & { __JOURNEY_DEBUG__?: boolean; __JOURNEY_STILL__?: boolean };
    still = !!dbg.__JOURNEY_STILL__;
    // Frames are judged by the gap until the next frame after one we drew (the
    // GPU finishes after render() returns). Two very slow gaps in a row → hand
    // back to the plain photos; scrolling must never be held up by the scene.
    if (lastDrawT && !dbg.__JOURNEY_DEBUG__) {
      const gap = now - lastDrawT;
      if (gap > 160) { if (++slowStrikes >= 2) { gaveUp = true; giveUp(); return; } } else slowStrikes = 0;
      if (++frames <= 120 && gap > 40) slowFrames++;
      if (frames === 120 && slowFrames > 40 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio * 0.7); renderer.setPixelRatio(pixelRatio); resize(); }
    }
    lastDrawT = 0;
    const moving = Math.abs(target - cur) > 0.0005;
    if (moving) cur = still ? target : cur + (target - cur) * 0.2; // catches up with the scroll in ~0.2 s
    const ambientDue = !still && now - lastAmbient > 33;
    if (!moving && !ambientDue && !dirty) return;
    if (ambientDue) lastAmbient = now;
    const drew = draw(now);
    if (drew) {
      lastDrawT = now;
      if (dirty && live[0]) { dirty = false; performance.mark("journey:first-frame"); resolveFirst(); }
      dirty = false;
    }
  };
  raf = requestAnimationFrame(loop);

  return {
    firstFrame,
    load,
    setPosition: (p: number) => { target = p; },
    onGiveUp: (cb) => { giveUp = cb; },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      for (const l of live) {
        if (!l) continue;
        (l.mat.uniforms.map.value as THREE.Texture).dispose();
        (l.mat.uniforms.depthMap.value as THREE.Texture).dispose();
        l.mat.dispose();
      }
      geo.dispose();
      flock.forEach((b) => { b.mat.dispose(); (b.l.geometry as THREE.BufferGeometry).dispose(); });
      renderer.dispose();
    },
  };
}
