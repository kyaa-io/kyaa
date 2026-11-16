export type MaskRect = { x: number; y: number; w: number; h: number };

export const PROOF_MAX_IMAGES = 3;
export const PROOF_IMAGE_MAX_EDGE = 1600;

/** 8x8 average hash as 16 lowercase hex characters (accepted by proofPhashSchema). */
export function averageHash(gray: ArrayLike<number>): string {
  const cells = Array.from(gray);
  const mean = cells.reduce((sum, value) => sum + value, 0) / (cells.length || 1);
  let bits = "";
  for (const value of cells) bits += value >= mean ? "1" : "0";
  let hex = "";
  for (let index = 0; index < bits.length; index += 4) hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  return hex;
}

/** Scale to fit the maximum edge without enlarging. */
export function fitSize(width: number, height: number, maxEdge = PROOF_IMAGE_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type Box = { w: number; h: number };
export type Region = { x: number; y: number; w: number; h: number };

/** Where an object-fit:contain image really sits inside its element box (the rest of the box is empty). Same units as the inputs. */
export function containRegion(box: Box, natural: Box): Region {
  if (!(box.w > 0 && box.h > 0 && natural.w > 0 && natural.h > 0)) return { x: 0, y: 0, w: box.w, h: box.h };
  const scale = Math.min(box.w / natural.w, box.h / natural.h);
  const w = natural.w * scale, h = natural.h * scale;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

/** Pointer position inside the element box (px) -> 0..1 position on the image itself; points in the empty margin clamp to the nearest image edge. */
export function pointOnImage(px: number, py: number, region: Region): { x: number; y: number } {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clamp((px - region.x) / (region.w || 1)), y: clamp((py - region.y) / (region.h || 1)) };
}

/** Image-normalised rectangle -> element-box fractions (0..1), for drawing the cover over the contained image. */
export function rectInBox(rect: MaskRect, region: Region, box: Box): MaskRect {
  return { x: (region.x + rect.x * region.w) / box.w, y: (region.y + rect.y * region.h) / box.h, w: (rect.w * region.w) / box.w, h: (rect.h * region.h) / box.h };
}

/** Normalised (0..1) rectangle from two pointer positions, in any drag direction. */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): MaskRect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * Draw the source, cover the masks, and re-encode to webp. Re-encoding through a canvas drops
 * all EXIF/metadata. The hash is taken from the masked pixels, never from the original.
 */
export async function maskAndEncode(file: Blob, masks: MaskRect[]): Promise<{ blob: Blob; phash: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  context.fillStyle = "#000";
  for (const m of masks) context.fillRect(m.x * width, m.y * height, m.w * width, m.h * height);
  const small = document.createElement("canvas");
  small.width = 8;
  small.height = 8;
  const smallContext = small.getContext("2d");
  if (!smallContext) throw new Error("canvas unavailable");
  smallContext.drawImage(canvas, 0, 0, 8, 8);
  const pixels = smallContext.getImageData(0, 0, 8, 8).data;
  const gray: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) gray.push(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("encode failed"))), "image/webp", 0.85));
  return { blob, phash: averageHash(gray) };
}
