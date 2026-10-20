import "server-only";
import sharp from "sharp";

export const MAX_PHOTOCARD_BYTES = 8 * 1024 * 1024;

export async function renderPhotocard(bytes: Uint8Array, code: string): Promise<Uint8Array> {
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTOCARD_BYTES || !/^[A-Z0-9-]{6,40}$/.test(code)) throw new Error("PHOTOCARD_UNAVAILABLE");
  const input = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 });
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("PHOTOCARD_UNAVAILABLE");
  const resized = await input.rotate().resize({ width: 1440, height: 1440, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const size = Math.max(12, Math.round(Math.min(width, height) / 32));
  const label = `KYAA · ${code}`;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="mark" width="${size * 20}" height="${size * 9}" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><text x="${size}" y="${size * 4}" font-family="sans-serif" font-size="${size}" fill="white" fill-opacity=".24" stroke="black" stroke-opacity=".15" stroke-width=".5">${label}</text></pattern></defs><rect width="100%" height="100%" fill="url(#mark)"/></svg>`);
  // Burn the member code into pixels so removing a DOM overlay cannot reveal an unmarked image.
  return new Uint8Array(await sharp(resized.data).composite([{ input: overlay }]).webp({ quality: 82 }).toBuffer());
}
