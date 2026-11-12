/**
 * DOM 기프트카드(FanPrintGiftCard)를 재서 three.js 장면에 넘길 값으로 옮긴다: 자리·크기·기울기와, 카드 면을 그대로 옮겨 그린 캔버스.
 * 글자는 DOM이 놓은 글자 자리(글자마다 Range)를 그대로 따라 그려서 굵기·자간·숫자 폭이 화면 글자와 같다. three.js는 여기서 쓰지 않는다.
 */
import type { FloatCard, FloatLayout, FloatPile } from "./float-art";

const part = (root: Element, name: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-fan-print-part="${name}"]`));
const angle = (value: string) => { const match = /(-?[\d.]+)(deg|rad|turn)/.exec(value); if (!match) return 0; const n = Number(match[1]); return match[2] === "deg" ? n * Math.PI / 180 : match[2] === "turn" ? n * Math.PI * 2 : n; };
const shift = (value: string) => { const match = value.match(/-?[\d.]+px/g); return match ? { x: parseFloat(match[0]!), y: parseFloat(match[1] ?? "0") } : { x: 0, y: 0 }; };
const urlOf = (value: string) => /url\(["']?(.*?)["']?\)/.exec(value)?.[1];

/** offsetParent를 따라 올라가며 조상(ancestor) 기준 왼쪽 위 자리를 구한다. transform(기울기)의 영향을 받지 않는다. */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = element; node && node !== ancestor; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop; }
  return { x, y };
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string) {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url; });
    images.set(url, pending);
  }
  return pending;
}

/** `drop-shadow(x y blur color)` 두 개에서 [x, y, blur, 불투명도]를 읽는다. 읽지 못하면 그림자 없음. */
function shadows(filter: string) {
  const found = Array.from(filter.matchAll(/drop-shadow\(([^()]*(?:\([^()]*\))?[^()]*)\)/g), match => {
    const body = match[1]!, lengths = (body.match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    const alpha = /\/\s*([\d.]+%?)\s*\)/.exec(body)?.[1] ?? /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(body)?.[1] ?? "1";
    return [lengths[0] ?? 0, lengths[1] ?? 0, lengths[2] ?? 0, alpha.endsWith("%") ? parseFloat(alpha) / 100 : Number(alpha)] as const;
  });
  const none = [0, 0, 1, 0] as const;
  return { contact: found[0] ?? none, cast: found[1] ?? none };
}

async function drawFace(face: HTMLElement, scale: number, withInk: boolean) {
  const width = face.offsetWidth, height = face.offsetHeight, style = getComputedStyle(face);
  const canvas = document.createElement("canvas"); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!; ctx.scale(canvas.width / width, canvas.height / height);
  ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, width, height);
  const material = urlOf(style.backgroundImage), photo = material ? await loadImage(material) : null;
  if (photo) { // background: center / cover
    const fit = Math.max(width / photo.naturalWidth, height / photo.naturalHeight), w = photo.naturalWidth * fit, h = photo.naturalHeight * fit;
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(photo, (width - w) / 2, (height - h) / 2, w, h);
  }
  // box-shadow: inset 0 0 0 1px <edge>
  const edge = /^(.*?)\s+0px 0px 0px 1px inset/.exec(style.boxShadow)?.[1];
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(.5, .5, width - 1, height - 1, Math.max(0, parseFloat(style.borderTopLeftRadius) - .5)); ctx.stroke(); }
  if (!withInk) return canvas;

  for (const mark of part(face, "mark")) {
    const markStyle = getComputedStyle(mark), url = urlOf(markStyle.maskImage || markStyle.webkitMaskImage || ""), image = url ? await loadImage(url) : null;
    if (!image) continue;
    const at = offsetWithin(mark, face), w = mark.offsetWidth, h = mark.offsetHeight;
    const stencil = document.createElement("canvas"); stencil.width = Math.max(1, Math.round(w * scale)); stencil.height = Math.max(1, Math.round(h * scale));
    const cut = stencil.getContext("2d")!;
    const ratio = (image.naturalWidth || w) / (image.naturalHeight || h), fitW = Math.min(stencil.width, stencil.height * ratio), fitH = fitW / ratio;
    cut.drawImage(image, (stencil.width - fitW) / 2, (stencil.height - fitH) / 2, fitW, fitH);
    cut.globalCompositeOperation = "source-in"; cut.fillStyle = markStyle.color; cut.fillRect(0, 0, stencil.width, stencil.height);
    ctx.drawImage(stencil, at.x, at.y, w, h);
  }

  const cos = Math.cos(angle(getComputedStyle(face.closest<HTMLElement>('[data-fan-print="gift-card"]') ?? face).rotate));
  for (const ink of part(face, "ink")) {
    const node = ink.firstChild, text = ink.textContent ?? "";
    if (!node || node.nodeType !== Node.TEXT_NODE || !text) continue;
    const inkStyle = getComputedStyle(ink), size = parseFloat(inkStyle.fontSize);
    const font = `${inkStyle.fontStyle} ${inkStyle.fontWeight} ${size}px ${inkStyle.fontFamily}`;
    try { await document.fonts.load(font, text); } catch { /* 글꼴을 못 읽으면 대체 글꼴로 그린다 */ }
    ctx.font = font; ctx.fillStyle = inkStyle.color; ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
    const at = offsetWithin(ink, face), metrics = ctx.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent ?? size * .8, descent = metrics.fontBoundingBoxDescent ?? size * .2;
    const baseline = at.y + (ink.offsetHeight - (ascent + descent)) / 2 + ascent;
    // 글자마다 DOM이 준 칸(자간·고정폭 숫자 포함)의 가운데에 그린다. 기울기가 1도 안팎이라 가로 간격은 cos로만 되돌린다.
    const range = document.createRange(), letterSpacing = parseFloat(inkStyle.letterSpacing) || 0;
    let origin: number | null = null;
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const box = range.getBoundingClientRect();
      if (origin === null) origin = box.left;
      const cell = box.width / cos, left = at.x + (box.left - origin) / cos;
      ctx.fillText(text[i]!, left + (cell - letterSpacing) / 2, baseline);
    }
  }
  return canvas;
}

/** 책상(desk) 안의 기프트카드 묶음을 재서 장면 배치로 옮긴다. 쌓이는 연출이 끝난 뒤에 불러야 한다. */
export async function measureCards(desk: HTMLElement): Promise<FloatLayout> {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const piles: FloatPile[] = [];
  for (const gift of Array.from(desk.querySelectorAll<HTMLElement>('[data-fan-print="gift-card"]'))) {
    const face = part(gift, "face")[0];
    if (!face) continue;
    const giftStyle = getComputedStyle(gift), at = offsetWithin(gift, desk), half = { x: gift.offsetWidth / 2, y: gift.offsetHeight / 2 };
    const center = (element: HTMLElement): FloatCard => {
      const own = offsetWithin(element, gift), style = getComputedStyle(element), moved = shift(style.translate);
      return { x: own.x + element.offsetWidth / 2 - half.x + moved.x, y: own.y + element.offsetHeight / 2 - half.y + moved.y, rotate: angle(style.rotate) };
    };
    const width = face.offsetWidth, height = face.offsetHeight, scale = Math.min(ratio * 2, 2048 / width);
    const under = part(gift, "under").map(center);
    const print = await drawFace(face, scale, true);
    piles.push({
      cx: at.x + half.x, cy: at.y + half.y, rotate: angle(giftStyle.rotate), width, height, radius: parseFloat(getComputedStyle(face).borderTopLeftRadius) || 0,
      top: center(face), under, face: print, blank: under.length ? await drawFace(face, scale / 2, false) : print, shadow: shadows(giftStyle.filter),
    });
  }
  return { width: desk.clientWidth, height: desk.clientHeight, piles };
}
