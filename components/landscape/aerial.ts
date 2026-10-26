// The opening shot of the home page: a dawn flight over the real hills of
// Sirmaur, towards Churdhar and the snows of the Great Himalaya beyond.
//
// Realism comes from real data, not from drawing:
//  • Terrain: Copernicus 30 m elevation in three rings (fine near the camera,
//    coarser out to 250 km), with the earth's curvature applied.
//  • Surface: Sentinel-2 satellite imagery, re-lit offline for a low sun in the
//    east-south-east with long shadows cast by the actual ridges
//    (scripts/landscape/bake_terrain.py).
//  • Sky: a dawn sky modelled on real Himalayan dawns (deep blue zenith, warm
//    horizon towards the sun, the pink "belt of Venus" and the earth's shadow
//    opposite it); distant terrain sinks into haze sampled from that same sky,
//    so the horizon is seamless (aerial perspective).
//  • Valley fog: a layer that fills the real river valleys below ~850 m.
//  • Clouds: the cumulus cut from the team's own photo of the foothills.
//  • A few griffon vultures soaring near the camera.
// Scroll moves the camera from high above the Paonta valley down towards the
// hills around Renuka and Dadahu.

import * as THREE from "three";
import { REGIONS, colorUrl, build, type Built, type Region } from "./aerialData";

export type Aerial = {
  ready: Promise<void>;
  /** draw the shot at progress t (0 … 1) and time s (seconds) */
  render: (t: number, s: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
};

const SUN_AZ = 108, SUN_EL = 8.5;          // must match bake_terrain.py
const R_EFF = 6371000 / (1 - 0.13);       // earth radius with standard refraction
const FOG_TOP = 860;                       // valley fog lies below this (metres)

const sunDir = (() => {
  const a = THREE.MathUtils.degToRad(SUN_AZ), e = THREE.MathUtils.degToRad(SUN_EL);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
})();

// scene space: x east, y up, z = −north (metres)
const rectOf = (r: Region, inset = 0) =>
  new THREE.Vector4(r.xr[0] * 1000 + inset, -r.yr[1] * 1000 + inset, r.xr[1] * 1000 - inset, -r.yr[0] * 1000 - inset);

const NOISE = /* glsl */ `
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

// curvature: the ground falls away from the viewer by d²/2R
const CURVE_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  vec4 curved(vec3 p) {
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec2 d = wp.xz - cameraPosition.xz;
    wp.y -= dot(d, d) / (2.0 * ${R_EFF.toFixed(1)});
    vWorld = wp.xyz;
    return projectionMatrix * viewMatrix * wp;
  }
`;

// aerial perspective: extinction by distance (blue fades first) and in-scatter
// from the actual sky colour in that direction
const HAZE = /* glsl */ `
  uniform samplerCube skyCube;
  uniform float hazeK;
  uniform float hazeGain;
  vec3 aerial(vec3 col, vec3 world) {
    vec3 ray = world - cameraPosition;
    float dist = length(ray);
    vec3 V = ray / dist;
    float hAvg = max(0.0, 0.5 * (world.y + cameraPosition.y));
    vec3 beta = (vec3(5.8e-6, 13.5e-6, 33.1e-6) + 1.1e-5) * hazeK;
    vec3 ext = exp(-beta * dist * exp(-hAvg / 2100.0));
    vec3 sky = textureCube(skyCube, normalize(vec3(V.x, max(V.y, 0.012), V.z))).rgb * hazeGain;
    return col * ext + sky * (1.0 - ext);
  }
`;

function terrainMaterial(map: THREE.Texture, uvRect: THREE.Vector4, hole: THREE.Vector4 | null, shared: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      uvRect: { value: uvRect },
      hole: { value: hole ?? new THREE.Vector4(1, 1, -1, -1) },
      gain: shared.gain,
    },
    vertexShader: /* glsl */ `
      uniform vec4 uvRect; // minX, minZ (north edge), maxX, maxZ (south edge)
      varying vec2 vUv;
      ${CURVE_VERTEX}
      void main() {
        // images are north-up and uploaded with flipY, so v = 1 is the north edge
        vUv = vec2((position.x - uvRect.x) / (uvRect.z - uvRect.x), (uvRect.w - position.z) / (uvRect.w - uvRect.y));
        gl_Position = curved(position);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec4 hole;
      uniform float gain;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${NOISE}
      ${HAZE}
      void main() {
        // a finer ring of terrain is drawn here instead
        if (vWorld.x > hole.x && vWorld.x < hole.z && vWorld.z > hole.y && vWorld.z < hole.w) discard;
        vec3 base = texture2D(map, vUv).rgb;
        // where the camera comes close, add ground grain finer than the imagery
        float dist = distance(vWorld, cameraPosition);
        float near = 1.0 - smoothstep(1500.0, 9000.0, dist);
        float n = vnoise(vWorld.xz * 0.05) * 0.55 + vnoise(vWorld.xz * 0.19) * 0.45;
        base *= 1.0 + (n - 0.5) * 0.24 * near;
        // golden-hour grade: richer colour, warm light on the sunlit slopes, cool shade
        float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
        base = max(mix(vec3(lum), base, 1.32), 0.0);
        float lit = smoothstep(0.03, 0.16, lum);
        base *= mix(vec3(0.86, 0.93, 1.08), vec3(1.12, 0.98, 0.8), lit);
        gl_FragColor = vec4(aerial(base * gain, vWorld), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function fogMaterial(hMap: THREE.Texture, rect: THREE.Vector4, hFine: THREE.Texture, fineRect: THREE.Vector4, shared: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...shared, hMap: { value: hMap }, rect: { value: rect }, hFine: { value: hFine }, fineRect: { value: fineRect }, fogTop: { value: FOG_TOP }, time: shared.time, sunDir: { value: sunDir } },
    vertexShader: /* glsl */ `${CURVE_VERTEX} void main(){ gl_Position = curved(position); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D hMap;
      uniform vec4 rect;
      uniform sampler2D hFine;
      uniform vec4 fineRect;
      uniform float fogTop;
      uniform float time;
      uniform vec3 sunDir;
      varying vec3 vWorld;
      ${NOISE}
      ${HAZE}
      void main() {
        vec2 uv = vec2((vWorld.x - rect.x) / (rect.z - rect.x), (vWorld.z - rect.y) / (rect.w - rect.y));
        float ground = texture2D(hMap, uv).r;
        // the 25 m data where we have it, for crisp shorelines
        vec2 fuv = vec2((vWorld.x - fineRect.x) / (fineRect.z - fineRect.x), (vWorld.z - fineRect.y) / (fineRect.w - fineRect.y));
        if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) ground = texture2D(hFine, fuv).r;
        vec2 p = vWorld.xz;
        float swell = fbm(p * 0.00035 + vec2(time * 0.0012, 0.0));
        float top = fogTop + (swell - 0.5) * 110.0;
        float a = smoothstep(0.0, 170.0, top - ground);
        vec2 drift = vec2(time * 0.003, time * 0.0012);
        float wisp = fbm(p * 0.0011 + drift);
        // finer billows only where the camera is close enough to see them
        float near = 1.0 - smoothstep(3000.0, 14000.0, distance(vWorld, cameraPosition));
        float fine = fbm(p * 0.0045 + drift * 2.0);
        wisp = mix(wisp, wisp * 0.6 + fine * 0.4, near);
        a *= 0.5 + 0.5 * wisp;
        float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
        a *= smoothstep(0.0, 0.08, edge);
        // relief: billows facing the low sun catch warm light, their lee sides
        // fall into cool shadow (the height field is sampled towards the sun)
        vec2 toSun = normalize(sunDir.xz) * 160.0;
        float ahead = fbm((p + toSun) * 0.0011 + drift);
        float relief = clamp(0.5 + (wisp - ahead) * 5.0, 0.0, 1.0);
        vec3 sunLit = vec3(1.0, 0.72, 0.48) * 1.22;   // fog tops glow gold at sunrise
        vec3 shade = vec3(0.4, 0.42, 0.6);
        vec3 col = mix(shade, sunLit, 0.35 + 0.65 * relief * (0.6 + 0.4 * swell));
        gl_FragColor = vec4(aerial(col, vWorld), a * 0.9);
        #include <colorspace_fragment>
      }`,
  });
}

/** Dawn sky, in linear light. `disc`: draw the sun's glow core (not in the haze capture). */
function skyMaterial(disc: boolean) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float el = max(d.y, 0.0);
        float cosS = dot(d, sunDir);
        vec2 dh = normalize(d.xz + 1e-5), sh = normalize(sunDir.xz);
        float toward = dot(dh, sh) * 0.5 + 0.5;            // 1 towards the sun's azimuth, 0 away
        vec3 zenith = vec3(0.05, 0.14, 0.42);
        vec3 hzSun = vec3(1.0, 0.52, 0.22);
        vec3 hzAnti = vec3(0.78, 0.5, 0.55);                // belt of Venus: rose
        vec3 hz = mix(hzAnti, hzSun, pow(toward, 2.4));
        // warm and pink only in a low band; clear dawn blue above it
        vec3 col = mix(hz, mix(vec3(0.3, 0.44, 0.74), zenith, smoothstep(0.2, 0.75, el)), smoothstep(0.0, 0.26, el));
        // the earth's shadow: a cool band low on the side away from the sun
        float anti = pow(1.0 - toward, 2.0);
        col = mix(col, vec3(0.36, 0.40, 0.56), anti * smoothstep(0.075, 0.0, el) * 0.45);
        // glow around the sun
        float g = max(cosS, 0.0);
        col += vec3(1.0, 0.68, 0.38) * (pow(g, 5.0) * 0.32 + ${disc ? "pow(g, 90.0) * 0.8" : "0.0"});
        if (d.y < 0.0) col = hz * 0.92;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function griffon() {
  // a broad-winged soaring bird, seen as a silhouette
  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    0, 0, -0.35, 0, 0, 0.45, 1.5, 0.12, 0.05,
    1.5, 0.12, 0.05, 0, 0, -0.35, 1.45, 0.1, -0.25,
  ]), 3));
  const mat = new THREE.MeshBasicMaterial({ color: "#1c1712", side: THREE.DoubleSide, toneMapped: false });
  const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
  r.scale.x = -1;
  const g = new THREE.Group(); g.add(l, r);
  return { g, l, r, mat };
}

// camera route (x east, y up, north), metres
const V3 = (e: number, u: number, n: number) => new THREE.Vector3(e, u, -n);
const ROUTE = new THREE.CatmullRomCurve3([V3(2600, 3900, -17000), V3(1800, 3400, -11500), V3(900, 2900, -6500), V3(300, 2300, -2300)]);
// opening on the north-east: the Great Himalaya's snows ahead, the sunrise glow at the right;
// turning north-north-east as it descends over the hills
const LOOK = new THREE.CatmullRomCurve3([V3(29254, 2100, 27280), V3(14107, 1450, 19416), V3(5200, 1050, 12500), V3(2400, 780, 5600)]);

export function createAerial(renderer: THREE.WebGLRenderer, opts: { small: boolean }): Aerial {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 50, 520000);

  // ---- sky -------------------------------------------------------------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400000, 48, 24), skyMaterial(true));
  sky.renderOrder = 0;
  scene.add(sky);
  // the same sky, captured once into a small cube map, colours the haze
  const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(1, 1000000, cubeRT);
  const skyOnly = new THREE.Scene();
  const skyCopy = new THREE.Mesh(sky.geometry, skyMaterial(false));
  skyOnly.add(skyCopy);

  const shared: Record<string, THREE.IUniform> = {
    skyCube: { value: cubeRT.texture },
    hazeK: { value: 1.0 },
    hazeGain: { value: 1.0 },
    gain: { value: 1.25 },
    time: { value: 0 },
  };

  // ---- clouds: the cumulus from the team's own photo ------------------------
  const clouds: THREE.Sprite[] = [];
  const cloudTex = new THREE.TextureLoader().load("/images/landscape/clouds.webp", (t) => { t.colorSpace = THREE.SRGBColorSpace; });
  cloudTex.repeat.set(1105 / 1113, 1);
  const CLOUDS: [number, number, number, number, boolean][] = [ // east, up, north, width, mirrored
    [9500, 8200, 16454, 15000, false], [26488, 9800, 14084, 22000, true], [30854, 11500, 36770, 30000, true],
  ];
  for (const [e, u, n, w, flip] of CLOUDS) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, color: new THREE.Color(1.08, 0.84, 0.7) });
    const s = new THREE.Sprite(m);
    s.position.copy(V3(e, u, n)); s.scale.set(flip ? -w : w, w * (217 / 1105), 1);
    s.renderOrder = 2; scene.add(s); clouds.push(s);
  }

  // ---- birds ---------------------------------------------------------------
  const flock = Array.from({ length: 3 }, (_, k) => ({ ...griffon(), ph: k * 2.1, radius: 46 + k * 21, lift: k * 9 - 6, ahead: 260 + k * 70 }));
  for (const b of flock) scene.add(b.g);

  // ---- terrain ---------------------------------------------------------------
  const meshes: THREE.Mesh[] = [];
  const textures: THREE.Texture[] = [cloudTex];
  let fog: THREE.Mesh | null = null;

  const loadTex = (url: string) => new Promise<THREE.Texture>((res, rej) =>
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      // decode off the main thread now, so the upload later doesn't stall a frame
      const img = t.image as HTMLImageElement;
      (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => res(t));
    }, undefined, rej));

  const geometry = (): Promise<Built[]> => new Promise((resolve, reject) => {
    const inline = () => Promise.all(REGIONS.map((r) => build(r, opts.small ? 2 : 1))).then(resolve, reject);
    try {
      const w = new Worker(new URL("./aerial.worker.ts", import.meta.url));
      w.onmessage = (e: MessageEvent<{ ok: boolean; built?: Built[] }>) => { w.terminate(); if (e.data.ok && e.data.built) resolve(e.data.built); else void inline(); };
      w.onerror = () => { w.terminate(); void inline(); };
      w.postMessage({ small: opts.small });
    } catch { void inline(); }
  });

  const ready = (async () => {
    const [built, ...maps] = await Promise.all([geometry(), ...REGIONS.map((r) => loadTex(colorUrl(r, opts.small)))]);
    textures.push(...maps);
    REGIONS.forEach((r, i) => {
      const b = built.find((x) => x.name === r.name)!;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
      g.setIndex(new THREE.BufferAttribute(b.index, 1));
      g.computeBoundingSphere();
      // each coarser ring leaves a hole where the finer one is drawn, and sits a
      // touch lower so the finer ring wins along the seam
      const inner = i > 0 ? REGIONS[i - 1] : null;
      const hole = inner ? rectOf(inner, i === 1 ? 150 : 1500) : null;
      const mat = terrainMaterial(maps[i], rectOf(r), hole, shared);
      if (i > 0) { mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 2 * i; }
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.y = i === 0 ? 0 : i === 1 ? -6 : -40;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      scene.add(mesh); meshes.push(mesh);
    });
    // valley fog over the mid ring, reading the real valley floors
    const mid = built.find((x) => x.name === "mid")!;
    const [mw, mh] = REGIONS[1].grid;
    const hTex = new THREE.DataTexture(mid.heights, mw, mh, THREE.RedFormat, THREE.HalfFloatType);
    hTex.minFilter = hTex.magFilter = THREE.LinearFilter; hTex.needsUpdate = true;
    const det = built.find((x) => x.name === "detail")!;
    const [dw, dh] = REGIONS[0].grid;
    const hFine = new THREE.DataTexture(det.heights, dw, dh, THREE.RedFormat, THREE.HalfFloatType);
    hFine.minFilter = hFine.magFilter = THREE.LinearFilter; hFine.needsUpdate = true;
    textures.push(hTex, hFine);
    const mr = rectOf(REGIONS[1]);
    const fg = new THREE.PlaneGeometry(mr.z - mr.x, mr.w - mr.y, 160, 220);
    fg.rotateX(-Math.PI / 2);
    fg.translate((mr.x + mr.z) / 2, FOG_TOP, (mr.y + mr.w) / 2);
    fog = new THREE.Mesh(fg, fogMaterial(hTex, mr, hFine, rectOf(REGIONS[0]), shared));
    fog.frustumCulled = false; fog.renderOrder = 3;
    scene.add(fog);
    cubeCam.update(renderer, skyOnly);
    for (const t of textures) renderer.initTexture(t);
    try { await renderer.compileAsync(scene, camera); } catch { /* compiles on first draw */ }
    performance.mark("aerial:ready");
  })();

  const look = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
  const render = (t: number, s: number) => {
    const p = THREE.MathUtils.clamp(t, 0, 1);
    const e = 1 - Math.pow(1 - p, 1.35);
    ROUTE.getPoint(e, camera.position); LOOK.getPoint(e, look);
    // a slow drone float
    camera.position.x += Math.sin(s * 0.11) * 18; camera.position.y += Math.sin(s * 0.15 + 1.1) * 10;
    camera.lookAt(look);
    // opens on a long lens (the distant snows loom), widening as the camera descends
    const fov = THREE.MathUtils.lerp(portrait ? 46 : 27, portrait ? 60 : 40, e);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.rotateZ(Math.sin(s * 0.07) * 0.004 - 0.012 * e); // a slight bank as it descends
    sky.position.copy(camera.position);
    shared.time.value = s;
    // clouds thin out with distance
    for (const c of clouds) (c.material as THREE.SpriteMaterial).opacity = Math.exp(-c.position.distanceTo(camera.position) / 110000) * 0.95;
    // griffons circling below and ahead of the camera
    camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize(); upv.crossVectors(right, fwd);
    for (const b of flock) {
      const a = s * 0.12 + b.ph;
      b.g.position.copy(camera.position).addScaledVector(fwd, b.ahead).addScaledVector(right, Math.cos(a) * b.radius - 60).addScaledVector(upv, b.lift - 26 + Math.sin(a * 0.7) * 6);
      b.g.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI, Math.sin(a) * 0.25);
      const flap = Math.max(0, Math.sin(s * 1.6 + b.ph * 3)) ** 8 * 0.5; // mostly gliding, the odd wingbeat
      b.l.rotation.z = 0.12 + flap; b.r.rotation.z = -0.12 - flap;
    }
    renderer.render(scene, camera);
  };

  let portrait = false;
  const resize = (w: number, h: number) => {
    camera.aspect = w / Math.max(1, h);
    // portrait screens get a taller view so the peaks still fit
    portrait = camera.aspect < 1;
    camera.updateProjectionMatrix();
  };

  return {
    ready, render, resize,
    dispose: () => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      (skyCopy.material as THREE.Material).dispose();
      textures.forEach((t) => t.dispose());
      cubeRT.dispose();
    },
  };
}
