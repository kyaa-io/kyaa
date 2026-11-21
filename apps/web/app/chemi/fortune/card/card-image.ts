import { AMULET_PAPER, deepArt } from "../deep/copy";
import type { FortuneCharacterId } from "../lines";

export type CardImageInput = {
  kind: "keepsake" | "amulet";
  character: FortuneCharacterId;
  name: string;
  /** 2026.11.21 토 */
  date: string;
  score: number;
  grade: string;
  /** 부적 손글씨(줄바꿈 포함). */
  hand: string;
};

const W = 1024;
const H = 1536;
const UI = '"Pretendard Variable", Pretendard, sans-serif';
const HAND = '"Chemi Hand", cursive';

let handFont: Promise<unknown> | null = null;
/** 손글씨 서체는 카드 그림을 그릴 때만 내려받는다. */
function loadHand() {
  handFont ??= new FontFace("Chemi Hand", 'url("/fonts/chemi/chemi-hand-ks.woff2")').load().then((face) => document.fonts.add(face));
  return handFont;
}

async function load(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** 그림을 칸에 꽉 채워 그린다(object-fit: cover, 세로 맞춤 자리 지정). */
function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 0.5) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) * focusY, sw, sh, x, y, w, h);
}

/** 화면의 카드와 같은 구성으로 1024×1536 PNG 를 만든다. */
export async function renderCardImage(input: CardImageInput) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  // 서체를 못 받아도 카드는 기기의 흘림체로 그린다.
  await loadHand().catch(() => {});
  if (input.kind === "keepsake") {
    cover(ctx, await load(deepArt("keep", input.character)), 0, 0, W, H);
    const fade = ctx.createLinearGradient(0, H * 0.72, 0, H);
    fade.addColorStop(0, "rgb(255 255 255 / 0)");
    fade.addColorStop(0.46, "rgb(255 255 255 / 0.88)");
    fade.addColorStop(1, "rgb(255 255 255 / 0.88)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.strokeStyle = "#f3d9a0";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(35, 35, W - 70, H - 70, 27);
    ctx.stroke();
    ctx.fillStyle = "#1c1c1c";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 43px ${UI}`;
    ctx.fillText(input.date, 87, H - 170);
    ctx.font = `800 72px ${UI}`;
    ctx.fillText(input.grade, 87, H - 88);
    ctx.fillStyle = "#ad1457";
    ctx.textAlign = "right";
    ctx.font = `800 195px ${UI}`;
    ctx.fillText(String(input.score), W - 87, H - 86);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgb(74 23 46 / 0.55)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.font = `112px ${HAND}`;
    ctx.fillText(input.name, W - 82, 160);
  } else {
    cover(ctx, await load(AMULET_PAPER), 0, 0, W, H);
    const [x, y, w, h] = [W * 0.14, H * 0.145, W * 0.72, H * 0.47];
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [w / 2, w / 2, 30, 30]);
    ctx.clip();
    cover(ctx, await load(deepArt("care", input.character)), x, y, w, h * 1.28, 0.12);
    ctx.restore();
    ctx.strokeStyle = "#c9523f";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [w / 2, w / 2, 30, 30]);
    ctx.stroke();
    ctx.fillStyle = "#8f2a1c";
    ctx.textAlign = "center";
    ctx.font = `106px ${HAND}`;
    input.hand.split("\n").forEach((line, index) => ctx.fillText(line, W / 2, H * 0.655 + 96 + index * 119));
    ctx.font = `700 39px ${UI}`;
    ctx.fillText(`${input.name} · ${input.date}`, W / 2, H * 0.655 + 96 + input.hand.split("\n").length * 119 + 10);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(Error("PNG unavailable"))), "image/png"),
  );
  return new File([blob], `kyaa-${input.kind}-${input.date.slice(0, 10).replaceAll(".", "")}.png`, { type: "image/png" });
}

export function downloadCardImage(file: File) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

/** 기기의 공유 창으로 보낸다. 파일 공유를 못 하는 기기에서는 저장으로 대신한다. */
export async function shareCardImage(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return "shared" as const;
  }
  downloadCardImage(file);
  return "saved" as const;
}
