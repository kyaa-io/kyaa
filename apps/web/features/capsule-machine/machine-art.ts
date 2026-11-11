/**
 * B2 capsule machine: the vanilla three.js scene ported from the approved prototype (planning/specs/b2-proto/b-3d.html, three 0.170).
 * The server decides every result first; this module only plays the outcome it is given.
 * Named imports only, no three/webgpu, and RoundedBoxGeometry is the only addon (dev notes 2).
 */
import {
  AdditiveBlending, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Euler, ExtrudeGeometry,
  Group, HemisphereLight, LatheGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping,
  OctahedronGeometry, PCFSoftShadowMap, PMREMGenerator, PerspectiveCamera, PlaneGeometry, PointLight, Quaternion, RingGeometry,
  SRGBColorSpace, Scene, Shape, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Texture, TextureLoader, TorusGeometry, BackSide,
  Vector2, Vector3, WebGLRenderer, Matrix4, type BufferGeometry, type Material, type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { CAPSULE_COLORS, type CapsuleLevel, type CapsuleOutcome } from "./palette-art";
export type { CapsuleLevel, CapsuleOutcome };

export type CapsuleEngine = {
  /** Plays the dispense (and, for one capsule, the reveal) for outcomes the server already decided. Preview only dispenses a closed capsule. Resolves early when cleared. */
  play(count: 1 | 10, outcomes: readonly CapsuleOutcome[], preview?: boolean): Promise<string[]>;
  /** Cancels a running play and removes its effects. */
  clear(): void;
  start(): void;
  stop(): void;
  setSize(width: number, height: number): void;
  memory(): { geometries: number; textures: number };
  dispose(): void;
};

/** 럭키드로우 카드(C4)의 구도: 카메라와 응모권이 머무는 자리. 폭마다 기계가 무대 오른쪽에 오도록 옮긴다. */
export type CapsuleFraming = { fov: number; x: number; y: number; z: number; lookX: number; lookY: number; hover: readonly [number, number, number] };
export type CapsuleEngineOptions = {
  wordmarkUrl: string;
  /** 쉬는 동안의 장면(C4): 응모권이 투입구로 들어가는 8초 주기와 캡슐 구름. 주지 않으면 B2 장면 그대로다. */
  idle?: boolean;
  framing?: CapsuleFraming;
  /** idle에서 프레임을 건너뛰어도 4초 평균 24fps 미만이면 불린다. 부른 쪽이 캔버스를 내리고 정지 그림으로 돌아간다. */
  onStall?: () => void;
};

const R = 1.0, CR = 0.2, DOME = new Vector3(0, 2.05, 0), FLOOR_Y = 1.26, N = 26, CAM_Z = 7.6;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuad: (t: number) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: (t: number) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
};

const TEXTURE_SLOTS = ["map", "alphaMap", "aoMap", "bumpMap", "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughnessMap", "displacementMap", "emissiveMap", "envMap", "iridescenceMap", "iridescenceThicknessMap", "lightMap", "metalnessMap", "normalMap", "roughnessMap", "sheenColorMap", "sheenRoughnessMap", "specularColorMap", "specularIntensityMap", "thicknessMap", "transmissionMap"] as const;

/** Disposes a material and every texture slot it holds (dev notes 8). */
function disposeMaterial(material: Material, keep: ReadonlySet<object>) {
  if (keep.has(material)) return;
  const slots = material as unknown as Record<string, unknown>;
  for (const slot of TEXTURE_SLOTS) { const value = slots[slot]; if (value instanceof Texture && !keep.has(value)) value.dispose(); }
  if (material instanceof ShaderMaterial) for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof Texture && !keep.has(uniform.value)) uniform.value.dispose();
  material.dispose();
}
function disposeTree(root: Object3D, keep: ReadonlySet<object>) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.geometry && !keep.has(mesh.geometry)) (mesh.geometry as BufferGeometry).dispose();
    const material = (node as Mesh | Sprite).material as Material | Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => disposeMaterial(m, keep)); else if (material) disposeMaterial(material, keep);
  });
}

function radialTexture(stops: ReadonlyArray<readonly [number, string]>, size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, size, size); return new CanvasTexture(c);
}
function raysTexture(n: number) {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d")!;
  x.translate(S / 2, S / 2); x.filter = "blur(7px)";
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, w = (i % 2 ? .07 : .13);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, S / 2); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(.45, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, S / 2, a - w, a + w); x.closePath(); x.fill();
  }
  return new CanvasTexture(c);
}
/** The wordmark on a cream label (the prototype's svgToTexture). Resolves with an empty texture when the image cannot load. */
function labelTexture(url: string) {
  return new Promise<Texture>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = 1024, h = 360, c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d")!;
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#fde8f0"); x.fillStyle = g; x.fillRect(0, 0, w, h);
      const s = Math.min(w * .78 / img.width, h * .7 / img.height);
      x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8; resolve(t);
    };
    img.onerror = () => resolve(new Texture());
    img.src = url;
  });
}

type Cap = { g: Group; p: Vector3; v: Vector3; out: boolean };
type Task = (dt: number) => boolean;

export async function createCapsuleEngine(canvas: HTMLCanvasElement, options: CapsuleEngineOptions): Promise<CapsuleEngine> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  // Quality floor (dev notes 3): every device keeps twice the CSS resolution.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = NeutralToneMapping; renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0xffffff, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, .1, 50); camera.position.set(0, 2.15, CAM_Z); camera.lookAt(0, 1.68, 0);
  if (options.framing) { const f = options.framing; camera.fov = f.fov; camera.position.set(f.x, f.y, f.z); camera.lookAt(f.lookX, f.lookY, 0); camera.updateProjectionMatrix(); }
  // a touch wider than the prototype so the heart keeps a margin at 340–420px stage heights
  const keep = new Set<object>(); // shared capsule parts that effects reuse; disposed once at the end
  const extras: Object3D[] = [];
  const caps: Cap[] = [];
  let tasks: Task[] = [];
  let pending: Array<() => void> = [];
  let epoch = 0, disposed = false;

  // Studio reflections: white and pink softboxes (the prototype's studioEnv).
  const envScene = new Scene();
  envScene.add(new Mesh(new SphereGeometry(20, 32, 16), new MeshBasicMaterial({ color: "#d9b8c6", side: BackSide })));
  const panel = (w: number, h: number, p: [number, number, number], color: string, k: number) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), side: DoubleSide })); m.position.set(...p); m.lookAt(0, 0, 0); envScene.add(m); };
  panel(8, 3, [0, 9, 3], "#ffffff", 3.2); panel(2, 7, [-9, 2, 4], "#ffffff", 2.4); panel(2, 7, [9, 2, -1], "#ffb6d3", 1.6); panel(10, 2, [0, -2, -10], "#ffc4da", .9); panel(4, 1.5, [2, 1, 10], "#ffffff", 1.0);
  const pmrem = new PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(envScene, .02);
  scene.environment = envTarget.texture;
  pmrem.dispose(); disposeTree(envScene, keep);

  scene.add(new HemisphereLight("#ffffff", "#ffd6e6", .55));
  const key = new DirectionalLight("#ffffff", 1.9); key.position.set(1.2, 8, 3.5);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -.0004;
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 4.5, bottom: -1, near: 1, far: 15 });
  scene.add(key);
  const rimLight = new DirectionalLight("#ff9cc4", 1.2); rimLight.position.set(-4, 3, -3); scene.add(rimLight);

  // ---- materials and the shared capsule parts ----
  const mat = (c: string | Color, o: ConstructorParameters<typeof MeshPhysicalMaterial>[0] = {}) => new MeshPhysicalMaterial({ color: c, roughness: .3, clearcoat: 1, clearcoatRoughness: .08, ...o });
  const mats = {
    cream: mat("#fffaf6", { roughness: .28, sheen: .35, sheenColor: new Color("#ffe0ec") }),
    pink: mat("#f4a3c3", { roughness: .2 }),
    hot: mat("#e8478a", { roughness: .16, clearcoatRoughness: .02 }),
    chrome: new MeshStandardMaterial({ color: "#f7f3f7", metalness: 1, roughness: .08 }),
    seam: new MeshStandardMaterial({ color: "#ffffff", metalness: .4, roughness: .2 }),
    inner: new MeshStandardMaterial({ color: "#fff3f8", emissive: "#ffd9e8", emissiveIntensity: .55, roughness: .5, side: DoubleSide }),
    hole: new MeshStandardMaterial({ color: "#3d1027", roughness: .85 }),
    // The only transmission material (dev notes 3).
    glass: new MeshPhysicalMaterial({ color: "#fff4f8", transmission: 1, roughness: 0, thickness: .5, ior: 1.5, clearcoat: 1, clearcoatRoughness: .01, specularIntensity: 1, envMapIntensity: 1.6, attenuationColor: new Color("#ffeef5"), attenuationDistance: 12 }),
  };
  const capTop = new Map<string, MeshPhysicalMaterial>(), capBottom = new Map<string, MeshPhysicalMaterial>();
  for (const color of CAPSULE_COLORS) {
    capTop.set(color, mat(color, { side: DoubleSide, roughness: .12, iridescence: .25, iridescenceIOR: 1.3, clearcoatRoughness: .02 }));
    capBottom.set(color, mat(new Color(color).lerp(new Color("#ffffff"), .78), { side: DoubleSide, emissive: new Color(color).lerp(new Color("#ffffff"), .6), emissiveIntensity: .18, roughness: .2, iridescence: .45, iridescenceIOR: 1.3, sheen: .4, sheenColor: new Color("#ffffff") }));
  }
  const capGeo = {
    top: new SphereGeometry(CR, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    inner: new CircleGeometry(CR * .98, 40),
    bottom: new SphereGeometry(CR, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    seam: new TorusGeometry(CR * 1.008, .012, 8, 56),
  };
  for (const m of [...capTop.values(), ...capBottom.values(), mats.inner, mats.seam, ...Object.values(capGeo)]) keep.add(m);

  function capsuleMesh(color: string) {
    const g = new Group(), top = new Group();
    top.add(new Mesh(capGeo.top, capTop.get(color)!));
    const inner = new Mesh(capGeo.inner, mats.inner); inner.rotation.x = Math.PI / 2; top.add(inner);
    const bottom = new Mesh(capGeo.bottom, capBottom.get(color)!);
    const seam = new Mesh(capGeo.seam, mats.seam); seam.rotation.x = Math.PI / 2; seam.name = "seam";
    g.add(top, bottom, seam);
    g.userData = { top, color };
    g.traverse((m) => { if ((m as Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }
  const lathe = (pts: ReadonlyArray<readonly [number, number]>, m: Material, seg = 128) => { const o = new Mesh(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg), m); o.castShadow = o.receiveShadow = true; return o; };

  // ---- the machine ----
  const root = new Group(); scene.add(root);
  root.add(lathe([[0, 0], [1.1, 0], [1.135, .03], [1.135, .15], [1.075, .2], [0, .2]], mats.pink));
  root.add(lathe([[0, .2], [.99, .2], [.955, .45], [.905, .75], [.865, 1.02], [.835, 1.14], [.855, 1.17], [.855, 1.21], [0, 1.21]], mats.cream));
  const ring = (r: number, y: number, t = .022, m: Material = mats.chrome) => { const o = new Mesh(new TorusGeometry(r, t, 20, 128), m); o.rotation.x = Math.PI / 2; o.position.y = y; o.castShadow = true; root.add(o); return o; };
  ring(1.0, .205); ring(.86, 1.19, .028); ring(1.138, .09, .016);
  root.add(lathe([[0, 1.2], [.66, 1.2], [.665, 1.28], [.6, 1.315], [0, 1.315]], mats.pink));
  ring(.535, 1.315, .034);

  // Label wrapping the body with the kyaa wordmark.
  const logoMat = mat("#ffffff", { map: await labelTexture(options.wordmarkUrl), roughness: .25, clearcoat: 1, clearcoatRoughness: .05 });
  const LH = .27, LY = .96, arc = 1.02;
  const label = new Mesh(new CylinderGeometry(.866, .896, LH, 64, 1, true, -arc / 2, arc), logoMat); label.position.y = LY; root.add(label);
  for (const dy of [LH / 2, -LH / 2]) {
    const t = new Mesh(new TorusGeometry(dy > 0 ? .868 : .898, .012, 10, 64, arc), mats.chrome);
    t.rotation.set(Math.PI / 2, 0, Math.PI / 2 - arc / 2); t.position.y = LY + dy; root.add(t);
  }

  // Outlet.
  const frame = new Mesh(new RoundedBoxGeometry(.66, .44, .24, 6, .1), mats.chrome); frame.position.set(0, .5, .87); frame.rotation.x = -.08; root.add(frame);
  const hole = new Mesh(new RoundedBoxGeometry(.54, .34, .2, 6, .08), mats.hole); hole.position.set(0, .51, .93); hole.rotation.x = -.08; root.add(hole);
  const flap = new Mesh(new RoundedBoxGeometry(.5, .14, .03, 4, .03), mat("#ffd6e6", { transmission: 0, roughness: .1, transparent: true, opacity: .85 })); flap.position.set(0, .6, 1.02); flap.rotation.x = -.15; root.add(flap);
  const lip = new Mesh(new RoundedBoxGeometry(.58, .09, .22, 4, .04), mats.pink); lip.position.set(0, .31, 1.0); lip.castShadow = true; root.add(lip);

  // Crank.
  const crank = new Group(); crank.position.set(.64, .6, .6); crank.rotation.y = Math.PI / 4;
  const hub = new Mesh(new CylinderGeometry(.19, .21, .1, 64), mats.chrome); hub.rotation.x = Math.PI / 2; crank.add(hub);
  const hub2 = new Mesh(new CylinderGeometry(.12, .14, .1, 64), mats.pink); hub2.rotation.x = Math.PI / 2; hub2.position.z = .08; crank.add(hub2);
  const crankArm = new Group(); crankArm.position.z = .16;
  crankArm.add(new Mesh(new SphereGeometry(.07, 32, 16), mats.chrome));
  const arm = new Mesh(new CylinderGeometry(.034, .034, .34, 24), mats.chrome); arm.rotation.z = Math.PI / 2; arm.position.x = .17; crankArm.add(arm);
  const knob = new Mesh(new SphereGeometry(.105, 48, 32), mats.hot); knob.position.set(.36, 0, .04); crankArm.add(knob);
  crank.add(crankArm); crank.traverse((m) => { if ((m as Mesh).isMesh) m.castShadow = true; }); root.add(crank);

  // Dome: glass + rim light + the moving highlight.
  const domeGeo = new SphereGeometry(R, 128, 96, 0, Math.PI * 2, .42, 2.6 - .42);
  const dome = new Mesh(domeGeo, mats.glass); dome.position.copy(DOME); root.add(dome);
  const rimMat = new ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { c: { value: new Color("#f07aa9") } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.4); gl_FragColor = vec4(mix(c, vec3(1.), .2), f * .5); }" });
  const rim = new Mesh(domeGeo, rimMat); rim.position.copy(DOME); rim.renderOrder = 2; root.add(rim);
  const highlight = new Group(); highlight.position.copy(DOME); root.add(highlight);
  const hlm = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: .6, depthWrite: false, toneMapped: false });
  const hl1 = new Mesh(new SphereGeometry(R * 1.004, 48, 24, -2.15, .26, .6, 1.25), hlm); hl1.renderOrder = 3; highlight.add(hl1);
  const hl2 = new Mesh(new SphereGeometry(R * 1.004, 32, 16, -1.75, .07, .75, .9), hlm); hl2.renderOrder = 3; highlight.add(hl2);
  const pole = new Mesh(new CylinderGeometry(.045, .045, 1.7, 24), mats.pink); pole.position.set(0, 2.15, 0); root.add(pole);

  // Lid and heart knob.
  ring(.43, 2.962, .03);
  root.add(lathe([[0, 2.96], [.5, 2.96], [.552, 3.0], [.552, 3.12], [.47, 3.2], [.3, 3.27], [0, 3.29]], mats.cream));
  ring(.555, 3.05, .036, mats.pink);
  const stem = new Mesh(new CylinderGeometry(.05, .075, .07, 32), mats.chrome); stem.position.y = 3.32; root.add(stem);
  const hs = new Shape();
  hs.moveTo(5, 5); hs.bezierCurveTo(5, 5, 4, 0, 0, 0); hs.bezierCurveTo(-6, 0, -6, 7, -6, 7); hs.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  hs.bezierCurveTo(12, 15.4, 16, 11, 16, 7); hs.bezierCurveTo(16, 7, 16, 0, 10, 0); hs.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const hg = new ExtrudeGeometry(hs, { depth: 5, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 1.8, bevelSegments: 8, curveSegments: 32 }); hg.center();
  const heartMat = options.idle ? mats.hot.clone() : mats.hot; if (options.idle) { heartMat.emissive = new Color("#ff5c9d"); heartMat.emissiveIntensity = 0; }
  const heart = new Mesh(hg, heartMat); heart.scale.setScalar(.0125); heart.rotation.z = Math.PI; heart.position.y = 3.5; heart.castShadow = true; root.add(heart);

  // Floor: the pink glow under the machine.
  const fc = document.createElement("canvas"); fc.width = fc.height = 256; const fx = fc.getContext("2d")!;
  const fg = fx.createRadialGradient(128, 128, 10, 128, 128, 128); fg.addColorStop(0, "rgba(209,27,98,.22)"); fg.addColorStop(.55, "rgba(240,106,160,.07)"); fg.addColorStop(1, "rgba(240,106,160,0)");
  fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
  const glowFloor = new Mesh(new PlaneGeometry(3.8, 3.0), new MeshBasicMaterial({ map: new CanvasTexture(fc), transparent: true, depthWrite: false }));
  glowFloor.rotation.x = -Math.PI / 2; glowFloor.position.y = .003; scene.add(glowFloor);

  for (let i = 0; i < N; i++) {
    const g = capsuleMesh(CAPSULE_COLORS[i % CAPSULE_COLORS.length]!);
    const p = new Vector3((Math.random() - .5) * 1.1, FLOOR_Y + CR + Math.random() * 1.2, (Math.random() - .5) * 1.1);
    // Mostly the coloured half faces up.
    g.quaternion.setFromEuler(new Euler((Math.random() - .5) * 1.6 - .5, Math.random() * 6, (Math.random() - .5) * 1.6));
    g.position.copy(p); root.add(g);
    caps.push({ g, p, v: new Vector3(), out: false });
  }

  const dimPlane = new Mesh(new PlaneGeometry(20, 20), new MeshBasicMaterial({ color: "#fffafc", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  dimPlane.position.set(0, 1.6, 3.9); dimPlane.visible = false; scene.add(dimPlane);
  const dimMat = dimPlane.material;
  const flash = new PointLight("#ffd0e4", 0, 6); flash.position.set(0, 1.9, 5); scene.add(flash);

  // ---- physics (the prototype's, unchanged) ----
  const tmp = new Vector3(), n = new Vector3(), axis = new Vector3(), grav = new Vector3(0, -6.5, 0);
  function physics(h: number) {
    const act = caps.filter((c) => !c.out);
    for (const c of act) { c.v.addScaledVector(grav, h); c.p.addScaledVector(c.v, h); }
    const lim = R - CR - .03, e = .35;
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const a = act[i]!, b = act[j]!;
        tmp.subVectors(b.p, a.p); const d = tmp.length(), min = CR * 2;
        if (d < min && d > 1e-5) {
          n.copy(tmp).divideScalar(d); const ov = (min - d) / 2;
          a.p.addScaledVector(n, -ov); b.p.addScaledVector(n, ov);
          const rel = tmp.subVectors(b.v, a.v).dot(n);
          if (rel < 0) { const imp = -(1 + e) * rel / 2; a.v.addScaledVector(n, -imp); b.v.addScaledVector(n, imp); }
        }
      }
      for (const c of act) {
        tmp.subVectors(c.p, DOME); const d = tmp.length();
        if (d > lim) { n.copy(tmp).divideScalar(d); c.p.copy(DOME).addScaledVector(n, lim); const vn = c.v.dot(n); if (vn > 0) c.v.addScaledVector(n, -(1 + e) * vn); c.v.multiplyScalar(.985); }
        if (c.p.y < FLOOR_Y + CR) { c.p.y = FLOOR_Y + CR; if (c.v.y < 0) c.v.y *= -e; c.v.x *= .97; c.v.z *= .97; }
        const hd = Math.hypot(c.p.x, c.p.z), pm = .045 + CR;
        if (hd < pm && c.p.y < 2.96) { if (hd > 1e-4) { c.p.x *= pm / hd; c.p.z *= pm / hd; } else c.p.x = pm; }
      }
    }
    for (const c of act) {
      c.v.multiplyScalar(.998);
      const sp = Math.hypot(c.v.x, c.v.z);
      if (sp > 1e-3) { axis.set(c.v.z, 0, -c.v.x).normalize(); c.g.rotateOnWorldAxis(axis, sp * h / CR); }
      c.g.position.copy(c.p);
    }
  }
  for (let i = 0; i < 400; i++) physics(1 / 120);

  // ---- frame-driven tweens; clear() resolves every pending one so an awaiting play() can stop ----
  function tween(ms: number, fn: (k: number, raw: number) => void, e: (t: number) => number = ease.inOutCubic) {
    return new Promise<void>((resolve) => {
      const own = epoch; let t = 0;
      pending.push(resolve);
      tasks.push((dt) => {
        if (own !== epoch) return false;
        t += dt * 1000; const raw = Math.min(1, t / ms); fn(e(raw), raw);
        if (raw >= 1) { resolve(); return false; }
        return true;
      });
    });
  }
  const wait = (ms: number) => tween(ms, () => {}, ease.linear);
  function every(fn: (dt: number) => boolean) { const own = epoch; tasks.push((dt) => own === epoch && fn(dt)); }
  const addExtra = <T extends Object3D>(o: T) => { scene.add(o); extras.push(o); return o; };

  function jolt(s: number) { for (const c of caps) if (!c.out) { c.v.y += s * (.6 + Math.random() * .4); c.v.x += (Math.random() - .5) * s * .3; } }
  function tumble(ms: number) {
    let t = 0; const T = ms / 1000;
    return new Promise<void>((resolve) => {
      const own = epoch; pending.push(resolve);
      tasks.push((dt) => {
        if (own !== epoch) return false;
        t += dt; const k = t / T;
        const env = k < .25 ? ease.inOutCubic(k / .25) : k > .7 ? 1 - ease.inOutCubic((k - .7) / .3) : 1; // speed up, hold, ease off
        for (const c of caps) {
          if (c.out) continue; const r = Math.hypot(c.p.x, c.p.z) || .01;
          c.v.x += (-c.p.z / r) * 9 * env * dt; c.v.z += (c.p.x / r) * 9 * env * dt;
          if (c.p.y < FLOOR_Y + CR * 2.5) c.v.y += (14 + Math.random() * 10) * env * dt;
        }
        if (t >= T) { resolve(); return false; }
        return true;
      });
    });
  }

  const lowest = () => caps.filter((c) => !c.out).sort((a, b) => a.p.y - b.p.y)[0];

  async function dispense(i: number, count: number, rare: boolean, own: number) {
    const c = lowest(); if (!c) return null;
    c.out = true;
    const from = c.p.clone(), color = c.g.userData.color as string;
    await tween(220, (k) => { c.g.position.lerpVectors(from, new Vector3(0, FLOOR_Y + .05, 0), k); c.g.scale.setScalar(1 - .6 * k); });
    c.g.scale.setScalar(1); c.p.set((Math.random() - .5) * .4, 2.7, (Math.random() - .5) * .4); c.v.set(0, -1, 0); c.out = false;
    if (own !== epoch) return null;
    const o = addExtra(capsuleMesh(color));
    const p0 = root.localToWorld(new Vector3(0, .5, .7)), p1 = root.localToWorld(new Vector3(0, .48, 1.1));
    const spread = count === 1 ? 0 : (i - (count - 1) / 2) * .24;
    const land = new Vector3(spread + (Math.random() - .5) * .05, CR, 1.38 + (count === 1 ? 0 : (i % 2) * .2 - .12));
    o.quaternion.setFromEuler(new Euler(Math.random() * 3, Math.random() * 3, 0));
    await tween(count === 1 ? 260 : 160, (k) => { o.position.lerpVectors(p0, p1, k); }, ease.outCubic);
    if (own !== epoch) return null;
    const spin = new Vector3(Math.random() - .5, 0, Math.random() - .5).normalize();
    await tween(count === 1 ? 620 : 420, (k, raw) => {
      o.position.x = p1.x + (land.x - p1.x) * raw; o.position.z = p1.z + (land.z - p1.z) * raw; o.position.y = p1.y + (land.y - p1.y) * k;
      o.rotateOnWorldAxis(spin, .09);
    }, ease.outBounce);
    if (own !== epoch) return null;
    const base = o.scale.x;
    void tween(260, (k) => { const q = Math.sin(k * Math.PI) * (1 - k * .4); o.scale.set(base * (1 + .22 * q), base * (1 - .26 * q), base * (1 + .22 * q)); }, ease.linear);
    if (rare && own === epoch) {
      const g = addExtra(new Sprite(new SpriteMaterial({ map: radialTexture([[0, "rgba(255,255,255,1)"], [.3, "rgba(210,170,255,.85)"], [.65, "rgba(255,214,107,.35)"], [1, "rgba(140,200,255,0)"]], 128), transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending })));
      g.position.copy(o.position); g.renderOrder = 4;
      const topMesh = (o.userData.top as Group).children[0] as Mesh;
      const holo = (topMesh.material as MeshPhysicalMaterial).clone(); holo.iridescence = 1; holo.iridescenceIOR = 1.8; topMesh.material = holo;
      let t = 0; every((dt) => { t += dt; g.scale.setScalar(.9 + Math.sin(t * 5) * .15); g.material.opacity = Math.min(1, t * 2); holo.emissive.setHSL((t * .45) % 1, 1, .38); return true; });
    }
    return o;
  }

  function burst(pos: Vector3, level: CapsuleLevel) {
    const face = camera.position.clone();
    const ringSet: Array<[string, number, number]> = level === 2 ? [["#c9a7ff", 0, 5.2], ["#ffd36b", 80, 4.6], ["#8fe3ff", 160, 4.0], ["#ff8cc6", 240, 3.4]]
      : level === 1 ? [["#f06aa0", 0, 4.2], ["#ffd36b", 90, 3.6]] : [["#f4a3c3", 0, 2.8]];
    for (const [c, d, sc] of ringSet) {
      const m = addExtra(new Mesh(new RingGeometry(.3, .345, 96), new MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })));
      m.position.copy(pos); m.lookAt(face); m.scale.setScalar(.4); m.renderOrder = 6;
      void wait(d).then(() => tween(level === 2 ? 900 : 620, (k) => { m.scale.setScalar(.4 + sc * k); m.material.opacity = 1 - k; }, ease.outCubic));
    }
    const pal = level === 2 ? ["#c9a7ff", "#ffd36b", "#8fe3ff", "#ff8cc6", "#ffffff", "#b5f2c8"] : ["#f06aa0", "#ffd36b", "#b79cf0", "#8fd0f0", "#ff9ec4", "#ffffff"];
    const count = [28, 70, 110][level]!, speed = [1.6, 2.4, 3.0][level]!;
    const pieces: Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const shape = i % 4 === 0 ? new OctahedronGeometry(.026) : i % 3 === 0 ? new CircleGeometry(.022, 10) : new PlaneGeometry(.05, .024);
      const m = addExtra(new Mesh(shape, new MeshBasicMaterial({ color: pal[i % pal.length], side: DoubleSide, transparent: true, toneMapped: false, depthWrite: false })));
      const a = Math.random() * Math.PI * 2, sp = speed * (.5 + Math.random() * .7);
      m.position.copy(pos); m.renderOrder = 7;
      m.userData = { v: new Vector3(Math.cos(a) * sp, Math.sin(a) * sp * .8 + 1.4, (Math.random() - .2) * .8), w: new Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), life: 1.6 + Math.random() * .8 };
      pieces.push(m);
    }
    let age = 0;
    every((dt) => {
      age += dt;
      for (const m of pieces) {
        const u = m.userData as { v: Vector3; w: Vector3; life: number }; u.v.y -= 3.2 * dt; u.v.multiplyScalar(.985);
        m.position.addScaledVector(u.v, dt); m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; m.rotation.z += u.w.z * dt;
        (m.material as MeshBasicMaterial).opacity = Math.max(0, 1 - Math.max(0, age - u.life * .55) / (u.life * .45));
      }
      return age < 2.6;
    });
  }

  /** Rare foreshadowing: night, light rays, aurora, rising motes and an iridescent capsule. */
  function rareAura(o: Group) {
    const st = { t: 0, k: 0 };
    const additive = { transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: AdditiveBlending } as const;
    const rays1 = addExtra(new Mesh(new PlaneGeometry(4.2, 4.2), new MeshBasicMaterial({ map: raysTexture(14), color: "#ffd36b", ...additive })));
    const rays2 = addExtra(new Mesh(new PlaneGeometry(3.6, 3.6), new MeshBasicMaterial({ map: raysTexture(10), color: "#c9a7ff", ...additive })));
    const aura = addExtra(new Sprite(new SpriteMaterial({ map: radialTexture([[0, "rgba(255,255,255,1)"], [.25, "rgba(255,214,107,.75)"], [.55, "rgba(180,140,255,.35)"], [1, "rgba(120,90,255,0)"]]), ...additive })));
    for (const m of [rays1, rays2]) { m.position.copy(o.position).add(new Vector3(0, 0, -.35)); m.renderOrder = 1; }
    aura.position.copy(o.position).add(new Vector3(0, 0, -.2)); aura.scale.setScalar(1.4); aura.renderOrder = 1;
    const moteTex = radialTexture([[0, "rgba(255,255,255,1)"], [.3, "rgba(255,240,200,.8)"], [1, "rgba(255,200,255,0)"]], 64);
    const motes = Array.from({ length: 36 }, (_, i) => {
      const m = addExtra(new Sprite(new SpriteMaterial({ map: moteTex, color: ["#ffffff", "#ffe08a", "#d6c2ff", "#9fe8ff"][i % 4], ...additive })));
      m.userData = { a: Math.random() * Math.PI * 2, r: .35 + Math.random() * .9, y: -.8 + Math.random() * 1.6, sp: .25 + Math.random() * .45, s: .03 + Math.random() * .05 };
      return m;
    });
    const topMesh = (o.userData.top as Group).children[0] as Mesh;
    const holo = (topMesh.material as MeshPhysicalMaterial).clone(); holo.iridescence = 1; holo.iridescenceIOR = 1.8; holo.iridescenceThicknessRange = [100, 800]; holo.emissive = new Color("#000000"); topMesh.material = holo;
    let h = 0;
    every((dt) => {
      st.t += dt; const k = st.k;
      rays1.rotation.z += dt * .35; rays2.rotation.z -= dt * .5;
      rays1.material.opacity = .5 * k; rays2.material.opacity = .4 * k;
      aura.material.opacity = (.75 + Math.sin(st.t * 6) * .2) * k; aura.scale.setScalar(1.3 + k * .9 + Math.sin(st.t * 4) * .08);
      h = (h + dt * .45) % 1; holo.emissive.setHSL(h, 1, .5 * k); holo.emissiveIntensity = 1; holo.color.setHSL((h + .33) % 1, .9, .55); holo.clearcoat = 1; holo.roughness = .08;
      for (const m of motes) {
        const u = m.userData as { a: number; r: number; y: number; sp: number; s: number }; u.y += u.sp * dt; if (u.y > 1.1) u.y = -.8; u.a += dt * .6;
        m.position.set(o.position.x + Math.cos(u.a) * u.r, o.position.y + u.y, o.position.z - .1 + Math.sin(u.a) * .3);
        m.scale.setScalar(u.s * (1 + Math.sin(st.t * 8 + u.a * 3) * .3)); m.material.opacity = k * Math.min(1, (1.1 - u.y) * 1.5);
      }
      return true;
    });
    return st;
  }

  // Grade light: white → pink → violet → gold, stopping at the real grade (no prize stays white). No near-miss staging.
  const RARITY_STEPS = ["#ffe3ef", "#f06aa0", "#9c6bff", "#ffb300"];
  async function squeezeOpen(o: Group, level: CapsuleLevel) {
    const seam = o.children.find((m) => m.name === "seam") as Mesh;
    const seamMat = new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }); seam.material = seamMat;
    const leak = addExtra(new Sprite(new SpriteMaterial({ map: radialTexture([[0, "rgba(255,255,255,1)"], [.4, "rgba(255,255,255,.55)"], [1, "rgba(255,255,255,0)"]], 128), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: AdditiveBlending })));
    leak.position.copy(o.position).add(new Vector3(0, -.02, .12)); leak.scale.set(1.2, .35, 1); leak.renderOrder = 6;
    const stop = level === 0 ? 0 : 3;
    const colorAt = (k: number) => { const f = k * stop, i = Math.min(stop, Math.floor(f)), j = Math.min(stop, i + 1), u = f - i; return new Color(RARITY_STEPS[i]).lerp(new Color(RARITY_STEPS[j]), u); };
    const S = 1.45, squash = (a: number) => o.scale.set(S * (1 + .12 * a), S * (1 - .15 * a), S * (1 + .12 * a));
    const top = o.userData.top as Group;
    // First squeeze: light leaks from the seam.
    await tween(420, (k) => { squash(k); o.rotation.z *= .9; seamMat.color.copy(colorAt(k * .4)).multiplyScalar(1 + 1.6 * k); leak.material.opacity = .5 * k; leak.material.color.copy(colorAt(k * .4)); });
    await tween(220, (k) => squash(1 - k * .7), ease.outCubic);
    await wait(260);
    // Second, harder: it parts a little and the light streams out.
    await tween(480, (k) => { squash(.3 + .9 * k); top.position.y = .025 * k; seamMat.color.copy(colorAt(.4 + .45 * k)).multiplyScalar(2.6); leak.material.opacity = .5 + .5 * k; leak.scale.set(1.2 + .8 * k, .35 + .25 * k, 1); leak.material.color.copy(colorAt(.4 + .45 * k)); });
    // Held breath: trembling while the colour reaches the final grade.
    await tween(level === 0 ? 380 : 560, (k, raw) => { o.rotation.z = Math.sin(raw * 70) * .025; seamMat.color.copy(colorAt(.85 + .15 * k)).multiplyScalar(2.6 + k); leak.material.color.copy(colorAt(.85 + .15 * k)); }, ease.linear);
    o.rotation.z = 0;
    void tween(500, (k) => { leak.material.opacity = 1 - k; }, ease.outCubic);
    return seamMat;
  }

  const loader = new TextureLoader(); loader.setCrossOrigin("anonymous");
  const prizeTexture = (url: string) => new Promise<Texture | null>((resolve) => { loader.load(url, (t) => { t.colorSpace = SRGBColorSpace; resolve(t); }, undefined, () => resolve(null)); });

  async function reveal(o: Group, outcome: CapsuleOutcome, own: number) {
    const level = outcome.level;
    dimPlane.visible = true;
    const dimFrom = new Color("#fffafc"), dimTo = new Color(level === 2 ? "#2a0d33" : "#fffafc");
    const from = o.position.clone(), to = new Vector3(0, 1.55, 4.3);
    const q0 = o.quaternion.clone(), q1 = new Quaternion().setFromEuler(new Euler(.55, 0, 0));
    const art = outcome.imageUrl && level > 0 ? prizeTexture(outcome.imageUrl) : Promise.resolve(null);
    await tween(520, (k) => { o.position.lerpVectors(from, to, k); o.scale.setScalar(1 + .45 * k); o.quaternion.slerpQuaternions(q0, q1, k); dimMat.opacity = .78 * k; });
    let ph = 0;
    if (level === 2) {
      // The white veil turns into a deep plum night and the capsule goes iridescent.
      const aura = rareAura(o);
      await tween(600, (k) => { dimMat.color.lerpColors(dimFrom, dimTo, k); dimMat.opacity = .78 + .14 * k; aura.k = k * .6; o.rotation.z = Math.sin(k * 6) * .05; });
      await tween(1500, (_k, raw) => { ph += .08 + raw * .5; o.rotation.z = Math.sin(ph) * (.05 + .2 * raw); aura.k = .6 + .4 * raw; }, ease.linear);
    } else {
      await tween(700, (_k, raw) => { ph += .1 + raw * .35; o.rotation.z = Math.sin(ph) * (.06 + .14 * raw); }, ease.linear);
    }
    if (own !== epoch) return;
    await squeezeOpen(o, level);
    if (own !== epoch) return;
    void tween(320, (k) => { const q = 1 - k; o.scale.set(1.45 * (1 + .16 * q - .05 * Math.sin(k * Math.PI)), 1.45 * (1 - .2 * q + .1 * Math.sin(k * Math.PI)), 1.45 * (1 + .16 * q)); }, ease.outBack);
    burst(o.position.clone(), level);
    const glow = addExtra(new Sprite(new SpriteMaterial({ map: radialTexture(level === 2 ? [[0, "rgba(255,255,255,1)"], [.3, "rgba(255,224,140,.9)"], [.6, "rgba(200,160,255,.45)"], [1, "rgba(140,200,255,0)"]] : [[0, "rgba(255,255,255,1)"], [.35, level ? "rgba(255,214,107,.9)" : "rgba(255,214,230,.7)"], [1, "rgba(255,140,190,0)"]], 128), transparent: true, depthWrite: false, toneMapped: false })));
    glow.position.copy(o.position).add(new Vector3(0, .1, .1)); glow.scale.setScalar(.01);
    const sparks: Mesh[] = [];
    for (let i = 0; i < [10, 22, 30][level]!; i++) {
      const s = addExtra(new Mesh(new OctahedronGeometry(.032), new MeshBasicMaterial({ color: (level === 2 ? ["#c9a7ff", "#ffd36b", "#8fe3ff"] : ["#f06aa0", "#ffd36b", "#b79cf0"])[i % 3], toneMapped: false })));
      const a = i / 22 * Math.PI * 2 + Math.random() * .3;
      s.userData.dir = new Vector3(Math.cos(a), Math.sin(a) * .9 + .35, .25).normalize().multiplyScalar(.8 + Math.random() * .6);
      s.position.copy(o.position); sparks.push(s);
    }
    const texture = await art;
    let card: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
    if (texture && own === epoch) {
      card = addExtra(new Mesh(new PlaneGeometry(.56, .56), new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, side: DoubleSide, depthWrite: false, depthTest: false })));
      card.position.copy(o.position); card.scale.setScalar(.01); card.renderOrder = 8;
    } else texture?.dispose();
    const top = o.userData.top as Group;
    await tween([650, 900, 1300][level]!, (k, raw) => {
      top.position.y = .025 + .3 * k; top.rotation.x = -.9 * k; top.position.z = -.1 * k;
      glow.scale.setScalar([1.2, 2.0, 3.0][level]! * k); glow.material.opacity = 1 - raw * .35;
      flash.intensity = [18, 40, 70][level]! * Math.sin(raw * Math.PI);
      for (const s of sparks) { s.position.copy(o.position).addScaledVector(s.userData.dir as Vector3, 1.15 * k); s.scale.setScalar(1.6 * (1 - raw) + .2); s.rotation.y += .25; }
      if (card) { card.position.set(o.position.x, o.position.y + .1 + .62 * k, o.position.z + .45); card.scale.setScalar(Math.max(.01, k * (level === 2 ? 1.15 : 1))); card.rotation.y = (1 - k) * Math.PI * (level === 2 ? 4 : 2); }
    }, ease.outBack);
    if (level === 2) { await wait(350); await tween(450, (k) => { dimMat.color.lerpColors(dimTo, new Color("#fff7fb"), k); }); }
  }

  // ---- C4 idle: 응모권 투입구와 응모권, 8초 주기 장면 (idle 옵션일 때만 만든다. 없으면 B2 장면에 아무것도 더해지지 않는다) ----
  const idleStep = options.idle ? buildIdle(options.framing?.hover ?? [-.86, 1.52, 3.5]) : null;
  function buildIdle(hover: readonly [number, number, number]) {
    const SLOT_A = -0.70, SLOT_Y = 0.70, SLOT_R = 0.915;
    const slotN = new Vector3(Math.sin(SLOT_A), 0, Math.cos(SLOT_A)), slotT = new Vector3(Math.cos(SLOT_A), 0, -Math.sin(SLOT_A));
    const slotPos = new Vector3().copy(slotN).multiplyScalar(SLOT_R).setY(SLOT_Y);
    const slotFrame = new Mesh(new RoundedBoxGeometry(.47, .14, .09, 5, .035), mats.chrome); slotFrame.position.copy(slotPos); slotFrame.rotation.y = SLOT_A; slotFrame.castShadow = true; root.add(slotFrame);
    const slotHole = new Mesh(new RoundedBoxGeometry(.38, .046, .06, 4, .018), mats.hole); slotHole.position.copy(slotPos).addScaledVector(slotN, .022); slotHole.rotation.y = SLOT_A; root.add(slotHole);
    const TW = .36, TH = .2;
    const ticketShape = (w: number, h: number, r: number, notch: number) => {
      const s = new Shape(), x = w / 2, y = h / 2;
      s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
      s.lineTo(x, -notch); s.absarc(x, 0, notch, -Math.PI / 2, Math.PI / 2, true); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
      s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
      s.lineTo(-x, notch); s.absarc(-x, 0, notch, Math.PI / 2, -Math.PI / 2, true); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
      return s;
    };
    const ticket = new Group();
    const ticketBody = new Mesh(new ExtrudeGeometry(ticketShape(TW, TH, .022, .026), { depth: .014, bevelEnabled: true, bevelThickness: .005, bevelSize: .005, bevelSegments: 4, curveSegments: 16 }), mat("#e8478a", { roughness: .18, clearcoatRoughness: .03 }));
    ticketBody.geometry.center(); ticketBody.castShadow = true; ticket.add(ticketBody);
    const plateGeo = new ExtrudeGeometry(ticketShape(TW * .74, TH * .62, .016, .0001), { depth: .004, bevelEnabled: false, curveSegments: 12 }); plateGeo.center();
    const plateMat = mat("#f0649f", { roughness: .2, clearcoatRoughness: .03 });
    for (const z of [.0115, -.0115]) { const plate = new Mesh(plateGeo, plateMat); plate.position.z = z; ticket.add(plate); }
    ticket.visible = false; root.add(ticket);
    // 투입구 앞 자세: 응모권의 긴 변이 투입구와 나란하고, 짧은 변 방향으로 밀려 들어간다.
    const qSlot = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(slotT, slotN, new Vector3().crossVectors(slotT, slotN)));
    const mouth = new Vector3().copy(slotPos).addScaledVector(slotN, TH / 2 + .06), inside = new Vector3().copy(slotPos).addScaledVector(slotN, -TH / 2 - .02);
    const hoverAt = new Vector3(...hover), qHover = new Quaternion().setFromEuler(new Euler(-.12, .38, -.22));
    const approach = new Vector3().copy(mouth).addScaledVector(slotN, .55).add(new Vector3(0, .22, 0));
    const ctrl1 = new Vector3().lerpVectors(hoverAt, approach, .4); ctrl1.y += .28;
    const wobble = new Quaternion(), wobbleEuler = new Euler();

    const CYCLE = 8, T_APPEAR = .4, T_HOVER = 1.7, T_FLY = 2.9, T_SLIDE = 3.3, T_REACT = 4.8, TILT = 4 * Math.PI / 180, TILT_PERIOD = 12;
    const bez = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number, out: Vector3) => { const u = 1 - t; return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t); };
    let idleT = 0, stirred = false, shadowTick = 0;
    renderer.shadowMap.autoUpdate = false; // 그림자는 3프레임에 한 번만 다시 그린다(캡슐이 느리게 움직인다)
    return function step(dt: number) {
      idleT += dt;
      const w = idleT * Math.PI * 2 / TILT_PERIOD;
      grav.set(Math.sin(TILT) * Math.cos(w) * 6.5, -Math.cos(TILT) * 6.5, Math.sin(TILT) * Math.sin(w) * 6.5);
      const c = idleT % CYCLE;
      if (c < T_APPEAR) { // 나타남: 크기만 0→1(넘침 없음)
        ticket.visible = true; ticket.scale.setScalar(Math.max(.001, ease.outCubic(c / T_APPEAR))); ticket.position.copy(hoverAt); ticket.quaternion.copy(qHover); stirred = false;
      } else if (c < T_HOVER) { // 머묾: ±4px 안팎의 오르내림, ±3° 기울임
        const s = Math.sin((c - T_APPEAR) * Math.PI * 2 / 2.6); ticket.scale.setScalar(1);
        ticket.position.copy(hoverAt); ticket.position.y += s * .02; ticket.quaternion.copy(qHover).multiply(wobble.setFromEuler(wobbleEuler.set(0, 0, s * .052)));
      } else if (c < T_FLY) { // 투입구로 미끄러져 간다
        const k = ease.inOutCubic((c - T_HOVER) / (T_FLY - T_HOVER));
        bez(hoverAt, ctrl1, approach, mouth, k, ticket.position); ticket.quaternion.slerpQuaternions(qHover, qSlot, ease.inOutCubic(Math.max(0, (k - .5) / .5))); // 앞면을 보인 채 날다가 마지막 절반에서 눕는다
      } else if (c < T_SLIDE) { // 들어간다
        ticket.position.lerpVectors(mouth, inside, ease.inOutQuad((c - T_FLY) / (T_SLIDE - T_FLY))); ticket.quaternion.copy(qSlot);
      } else {
        ticket.visible = false;
        if (!stirred) { stirred = true; for (const cap of caps) { if (cap.out) continue; const r = Math.hypot(cap.p.x, cap.p.z) || .01; cap.v.x += (-cap.p.z / r) * .55; cap.v.z += (cap.p.x / r) * .55; } }
      }
      heartMat.emissiveIntensity = .55 * (c >= T_SLIDE && c < T_REACT ? Math.sin((c - T_SLIDE) / (T_REACT - T_SLIDE) * Math.PI) : 0);
      if (shadowTick++ % 3 === 0) renderer.shadowMap.needsUpdate = true;
    };
  }

  // ---- loop: stops entirely while hidden (dev notes 7) ----
  let rafId = 0, prev = 0, acc = 0, running = false, fpsFrames = 0, fpsTime = 0;
  // idle 전용 낮춤(plan-ux P3 ③④): 그림자 1024로도 4초 평균 30fps 미만이면 한 프레임씩 건너뛰고, 그래도 24fps 미만이면 부른 쪽에 알린다. 첫 4초는 셰이더 컴파일 때문에 재지 않는다.
  let halfRate = false, halfTick = 0, stallFrames = 0, stallTime = 0, settled = 0;
  function loop(now: number) {
    if (!running) return;
    if (halfRate && ++halfTick % 2 === 0) { rafId = requestAnimationFrame(loop); return; }
    const elapsed = prev ? Math.max(0, (now - prev) / 1000) : 0;
    const dt = Math.min(.05, elapsed); prev = now; acc += dt;
    while (acc > 1 / 120) { physics(1 / 120); acc -= 1 / 120; }
    highlight.rotation.y = Math.sin(now / 1000 * .6) * .12; // only the light on the glass moves; the machine stays put
    idleStep?.(dt);
    const current = tasks; tasks = [];
    for (const task of current) if (task(dt)) tasks.push(task);
    renderer.render(scene, camera);
    fpsFrames++; fpsTime += elapsed;
    // Under 30 fps on average: only the shadow map drops to 1024; resolution and staging stay (dev notes 4).
    if (fpsTime >= 2) { if (fpsFrames / fpsTime < 30 && key.shadow.mapSize.x > 1024) { key.shadow.mapSize.set(1024, 1024); key.shadow.map?.dispose(); key.shadow.map = null; } fpsFrames = 0; fpsTime = 0; }
    if (idleStep) {
      if (settled < 4) settled += elapsed; else {
        stallFrames++; stallTime += elapsed;
        if (stallTime >= 4) {
          const avg = stallFrames / stallTime;
          if (avg < 30 && key.shadow.mapSize.x <= 1024) { if (halfRate && avg < 24) { running = false; options.onStall?.(); return; } halfRate = true; }
          stallFrames = 0; stallTime = 0;
        }
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function clear() {
    epoch++;
    const resolvers = pending; pending = []; tasks = [];
    resolvers.forEach((resolve) => resolve());
    for (const o of extras.splice(0)) { scene.remove(o); disposeTree(o, keep); }
    dimPlane.visible = false; dimMat.opacity = 0; dimMat.color.set("#fffafc"); flash.intensity = 0;
    crankArm.rotation.z = 0;
  }

  return {
    async play(count, outcomes, preview = false) {
      if (disposed) return [];
      clear();
      const own = epoch, alive = () => own === epoch;
      // Crank: one unbroken motion, slow start → steady → slow down with a small overshoot. Capsules only tremble.
      const r0 = crankArm.rotation.z, turns = count === 1 ? 2 : 3, total = Math.PI * 2 * turns;
      await tween(160, (k) => { crankArm.rotation.z = r0 + .18 * k; }, ease.outCubic);
      if (!alive()) return [];
      let lastJolt = 0;
      await tween(preview ? 3400 : count === 1 ? 1700 : 2300, (k, raw) => {
        crankArm.rotation.z = r0 + .18 * (1 - Math.min(1, raw * 6)) - total * k;
        if (raw - lastJolt > .12) { lastJolt = raw; jolt(.08); }
      }, ease.inOutQuad);
      if (!alive()) return [];
      await tween(260, (k) => { crankArm.rotation.z = r0 - total - .12 * Math.sin(k * Math.PI); }, ease.outCubic);
      if (!alive()) return [];
      await tumble(preview ? 4600 : count === 1 ? 2300 : 2700); // the drum turns and the capsules mix
      if (!alive()) return [];
      await wait(250);
      if (!alive()) return [];
      const colors: string[] = [];
      if (count === 1) {
        const o = await dispense(0, 1, false, own);
        if (!o || !alive()) return [];
        colors.push(o.userData.color as string);
        await wait(150);
        if (!alive()) return [];
        if (!preview) await reveal(o, outcomes[0] ?? { level: 0, imageUrl: null }, own);
        await wait(300);
      } else {
        const outs: Array<Promise<Group | null>> = [];
        for (let i = 0; i < count; i++) { outs.push(dispense(i, count, outcomes[i]?.level === 2, own)); await wait(140); }
        for (const o of await Promise.all(outs)) colors.push((o?.userData.color as string | undefined) ?? CAPSULE_COLORS[0]);
        await wait(500);
      }
      return alive() ? colors : [];
    },
    clear,
    start() { if (running || disposed) return; running = true; prev = 0; rafId = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(rafId); },
    setSize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
      if (!running && !disposed) renderer.render(scene, camera);
    },
    memory() { return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
    dispose() {
      if (disposed) return;
      disposed = true; running = false; cancelAnimationFrame(rafId);
      clear();
      scene.environment = null; envTarget.dispose();
      key.shadow.map?.dispose();
      const shared = new Set<object>();
      disposeTree(scene, shared);
      for (const m of [...capTop.values(), ...capBottom.values(), mats.inner, mats.seam]) disposeMaterial(m, shared);
      Object.values(capGeo).forEach((g) => g.dispose());
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the context now; browsers cap live contexts
    },
  };
}
