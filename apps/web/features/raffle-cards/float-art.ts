/**
 * 래플 경품 카드(FanPrintGiftCard)의 three.js 장면. DOM 카드와 같은 자리·같은 크기로 그리고, 맨 위 한 장만 책상에서 살짝 떠서 기운다.
 * 카드 면은 부른 쪽이 DOM을 그대로 옮겨 그린 고해상도 캔버스(card-face.ts)라 금액 글자가 흐려지지 않는다.
 * 화면 1px = 장면 1단위(z=0 평면). named import만 쓰고 addon은 없다(capsule-machine dev notes 2와 같은 원칙).
 */
import { CanvasTexture, Group, LinearMipmapLinearFilter, Mesh, PerspectiveCamera, PlaneGeometry, SRGBColorSpace, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";

export type FloatCard = { x: number; y: number; rotate: number };
export type FloatPile = {
  /** 묶음(.gift)의 가운데, 책상 왼쪽 위 기준 px. rotate는 CSS 각도(rad, 시계 방향이 +). */
  cx: number; cy: number; rotate: number;
  /** 카드 한 장의 크기와 모서리(px). */
  width: number; height: number; radius: number;
  /** 맨 위 카드와 그 아래 겹친 장들의 가운데(묶음 가운데 기준 px)와 기울기. under는 아래 장부터. */
  top: FloatCard; under: readonly FloatCard[];
  face: HTMLCanvasElement; blank: HTMLCanvasElement;
  /** 봉투 위 한 장처럼 아래 장이 없으면 카드 자체 그림자를, 있으면 묶음 그림자를 정지 상태의 DOM과 같게 둔다. */
  shadow: { contact: readonly [number, number, number, number]; cast: readonly [number, number, number, number] };
};
export type FloatLayout = { width: number; height: number; piles: readonly FloatPile[] };
export type FloatEngine = {
  setLayout(layout: FloatLayout): void;
  /** -1~1. 포인터(PC)나 기기 기울기(모바일)가 주는 시선 방향. */
  setPointer(x: number, y: number): void;
  start(): void;
  stop(): void;
  /** 정지 자세(DOM과 같은 그림)로 한 장 그린다. */
  renderStill(): void;
  dispose(): void;
};
export type FloatEngineOptions = { onStall?: () => void };

const FOV = 24, DEG = Math.PI / 180;
/** 움직임 값: 한 곳에 모아 둔다. 주기는 서로 맞물리지 않게 7·9·11초, 빛은 8초에 한 번 1.6초 동안 지나간다. */
const MOTION = { lift: .07, liftPeriod: 7, tiltX: 3 * DEG, tiltXPeriod: 9, tiltY: 4.5 * DEG, tiltYPeriod: 11, pointerX: 8 * DEG, pointerY: 6 * DEG, sweepEvery: 8, sweepFor: 1.6, sweepGap: .35, sweepGain: .16, rampFor: 1.4, follow: 4 };

const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const roundedBox = "float roundedBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }";
const cardShader = `uniform sampler2D uMap; uniform vec2 uSize; uniform float uRadius; uniform float uSweep; uniform float uGain; uniform float uShade; varying vec2 vUv; ${roundedBox}
void main(){
  float d = roundedBox((vUv - .5) * uSize, uSize * .5, uRadius);
  float alpha = clamp(.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (alpha <= 0.0) discard;
  vec3 color = texture2D(uMap, vUv, -.6).rgb * uShade;
  float along = vUv.x * .8 + (1.0 - vUv.y) * .35;
  float band = exp(-pow((along - uSweep) / .17, 2.0));
  color += band * uGain;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;
const shadowShader = `uniform vec2 uSize; uniform vec2 uCard; uniform float uRadius; uniform float uBlur; uniform float uOpacity; varying vec2 vUv; ${roundedBox}
void main(){
  float d = roundedBox((vUv - .5) * uSize, uCard * .5, uRadius);
  float alpha = uOpacity * (1.0 - smoothstep(-uBlur, uBlur, d));
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

type Shadow = { mesh: Mesh<PlaneGeometry, ShaderMaterial>; base: readonly [number, number, number, number] };
type Pile = { group: Group; floater: Group; face: ShaderMaterial; width: number; height: number; contact: Shadow; cast: Shadow; lifted: boolean };

export function createFloatEngine(canvas: HTMLCanvasElement, options: FloatEngineOptions = {}): FloatEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0xffffff, 0);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const scene = new Scene(), camera = new PerspectiveCamera(FOV, 1, 1, 10);
  const plane = new PlaneGeometry(1, 1);
  const root = new Group(); scene.add(root);
  let piles: Pile[] = [], owned: Array<{ dispose(): void }> = [];
  let running = false, frame = 0, last = 0, time = 0, ramp = 0, disposed = false;
  const pointer = new Vector2(), aim = new Vector2();
  let slowSince = 0, slowFrames = 0;

  const texture = (source: HTMLCanvasElement) => {
    const map = new CanvasTexture(source);
    map.colorSpace = SRGBColorSpace; map.anisotropy = anisotropy; map.generateMipmaps = true; map.minFilter = LinearMipmapLinearFilter;
    owned.push(map); return map;
  };
  const card = (map: CanvasTexture, pile: FloatPile) => {
    const material = new ShaderMaterial({ vertexShader, fragmentShader: cardShader, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uMap: { value: map }, uSize: { value: new Vector2(pile.width, pile.height) }, uRadius: { value: pile.radius }, uSweep: { value: -1 }, uGain: { value: 0 }, uShade: { value: 1 } } });
    owned.push(material);
    const mesh = new Mesh(plane, material); mesh.scale.set(pile.width, pile.height, 1); return mesh;
  };
  const shadow = (pile: FloatPile, base: readonly [number, number, number, number], width: number, height: number): Shadow => {
    const pad = 48;
    const material = new ShaderMaterial({ vertexShader, fragmentShader: shadowShader, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uSize: { value: new Vector2(width + pad * 2, height + pad * 2) }, uCard: { value: new Vector2(width, height) }, uRadius: { value: pile.radius }, uBlur: { value: Math.max(base[2], .5) }, uOpacity: { value: base[3] } } });
    owned.push(material);
    const mesh = new Mesh(plane, material); mesh.scale.set(width + pad * 2, height + pad * 2, 1);
    return { mesh, base };
  };
  const place = (object: { position: { set(x: number, y: number, z: number): unknown }; rotation: { z: number } }, at: FloatCard) => { object.position.set(at.x, -at.y, 0); object.rotation.z = -at.rotate; };

  function clear() {
    root.clear();
    for (const item of owned) item.dispose();
    owned = []; piles = [];
  }

  function setLayout(layout: FloatLayout) {
    clear();
    const { width, height } = layout;
    renderer.setSize(width, height, false);
    const distance = height / 2 / Math.tan(FOV * DEG / 2);
    camera.aspect = width / height; camera.near = distance / 10; camera.far = distance * 2; camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    let order = 0;
    for (const pile of layout.piles) {
      const group = new Group(); group.position.set(pile.cx - width / 2, height / 2 - pile.cy, 0); group.rotation.z = -pile.rotate; root.add(group);
      const lifted = pile.under.length > 0;
      const blank = lifted ? texture(pile.blank) : null;
      if (lifted) {
        // 묶음 그림자: 겹친 장 전체를 덮는 상자 하나. 움직이지 않는다.
        const ys = [pile.top.y, ...pile.under.map(item => item.y)], top = Math.min(...ys), bottom = Math.max(...ys);
        for (const base of [pile.shadow.cast, pile.shadow.contact]) {
          const still = shadow(pile, base, pile.width, pile.height + bottom - top);
          still.mesh.position.set(pile.top.x + base[0], -((top + bottom) / 2 + base[1]), 0); still.mesh.renderOrder = order++; group.add(still.mesh);
        }
        for (const under of pile.under) { const mesh = card(blank!, pile); place(mesh, under); mesh.renderOrder = order++; group.add(mesh); }
      }
      // 맨 위 카드의 그림자: 아래 장이 없으면 정지 때 DOM 그림자와 같고, 있으면 떠오른 만큼만 생긴다.
      const none = [0, 0, 1, 0] as const;
      const cast = shadow(pile, lifted ? none : pile.shadow.cast, pile.width, pile.height), contact = shadow(pile, lifted ? none : pile.shadow.contact, pile.width, pile.height);
      for (const item of [cast, contact]) { item.mesh.renderOrder = order++; group.add(item.mesh); }
      const floater = new Group(); place(floater, pile.top); group.add(floater);
      const face = card(texture(pile.face), pile); face.renderOrder = order++; floater.add(face);
      piles.push({ group, floater, face: face.material, width: pile.width, height: pile.height, contact, cast, lifted });
      // 그림자 자리의 기준은 맨 위 카드
      for (const item of [cast, contact]) item.mesh.userData.home = [pile.top.x, -pile.top.y, pile.top.rotate];
    }
    pose(0);
  }

  /** amount 0이면 DOM과 같은 정지 자세. */
  function pose(amount: number) {
    piles.forEach((pile, index) => {
      const phase = index * 1.7, turn = Math.PI * 2;
      const breath = .5 - .5 * Math.cos(time * turn / MOTION.liftPeriod + phase);
      const lift = pile.width * MOTION.lift * breath * amount;
      const tiltX = (Math.sin(time * turn / MOTION.tiltXPeriod + phase) * MOTION.tiltX - pointer.y * MOTION.pointerY) * amount;
      const tiltY = (Math.cos(time * turn / MOTION.tiltYPeriod + phase * 1.3) * MOTION.tiltY + pointer.x * MOTION.pointerX) * amount;
      pile.floater.position.z = lift; pile.floater.rotation.x = tiltX; pile.floater.rotation.y = tiltY;
      // 빛은 왼쪽 위에서 온다(자산 지시서와 같은 방향): 뜬 만큼 그림자가 오른쪽 아래로 길어지고 옅어진다.
      for (const [item, reach] of [[pile.cast, 1], [pile.contact, .25]] as const) {
        const [x, y, blur, opacity] = item.base, home = item.mesh.userData.home as [number, number, number];
        item.mesh.position.set(home[0] + x + lift * .55 * reach, home[1] - (y + lift * .9 * reach), 0); item.mesh.rotation.z = -home[2];
        const uniforms = item.mesh.material.uniforms;
        uniforms.uBlur!.value = Math.max(blur + lift * .9 * reach, .5);
        uniforms.uOpacity!.value = pile.lifted ? .14 * Math.min(1, lift / (pile.width * MOTION.lift)) * (reach === 1 ? 1 : .6) : opacity * (1 - .25 * breath * amount);
      }
      const cycle = ((time - index * MOTION.sweepGap) % MOTION.sweepEvery + MOTION.sweepEvery) % MOTION.sweepEvery;
      const uniforms = pile.face.uniforms;
      uniforms.uSweep!.value = -.45 + 2.05 * Math.min(1, cycle / MOTION.sweepFor) + pointer.x * .08 * amount;
      uniforms.uGain!.value = MOTION.sweepGain * amount;
      uniforms.uShade!.value = 1 + (tiltX * .25 - tiltY * .2) * amount;
    });
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (dt <= 0) return;
    time += dt; ramp = Math.min(1, ramp + dt / MOTION.rampFor);
    pointer.lerp(aim, 1 - Math.exp(-dt * MOTION.follow));
    pose(ramp * ramp * (3 - 2 * ramp));
    // 4초 평균 24fps 미만이면 정지 그림으로 돌아간다(capsule-machine과 같은 기준).
    slowFrames++;
    if (!slowSince) slowSince = now;
    else if (now - slowSince >= 4000) { const fps = slowFrames * 1000 / (now - slowSince); slowSince = now; slowFrames = 0; if (fps < 24) options.onStall?.(); }
  }

  return {
    setLayout,
    setPointer(x, y) { aim.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))); },
    start() { if (running || disposed) return; running = true; last = performance.now(); slowSince = 0; slowFrames = 0; frame = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(frame); },
    renderStill() { if (!disposed) pose(0); },
    dispose() { if (disposed) return; disposed = true; running = false; cancelAnimationFrame(frame); clear(); plane.dispose(); renderer.dispose(); },
  };
}
