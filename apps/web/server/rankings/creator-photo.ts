import "server-only";
import { publicImageRemotePatterns } from "@/components/fan-ui/public-image-policy";
import { publicFile } from "./public-file";

const MAX_BYTES = 5 * 1024 * 1024;
const allowedHosts = new Set(publicImageRemotePatterns.map(({ hostname }) => hostname));

/** The same public image hosts the image optimizer allows: https, no port or credentials. */
function allowedPhotoUrl(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && allowedHosts.has(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}

/** The body, or null once it passes MAX_BYTES (Content-Length may be absent or wrong, so the bytes actually read are counted too). */
async function readLimited(res: Response) {
  if (Number(res.headers.get("content-length")) > MAX_BYTES) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const base64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");

/** The creator photo as a data URI for Satori (PNG and JPEG only). A stored path is read from public/ like the fonts; a stored absolute URL is the
 * public asset host. The request's Host is never used. Anything else, or a failed read: null, and the card draws the initial instead. */
export async function creatorPhotoDataUri(src: string | undefined) {
  if (!src) return null;
  try {
    if (src.startsWith("/") && !src.startsWith("//")) {
      const type = /\.png$/i.test(src) ? "image/png" : /\.jpe?g$/i.test(src) ? "image/jpeg" : null;
      if (!type || src.includes("..")) return null;
      return `data:${type};base64,${base64(await publicFile(`public${src}` as `public/${string}`))}`;
    }
    if (!allowedPhotoUrl(src)) return null;
    const res = await fetch(src, { redirect: "error", signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/png", "image/jpeg"].includes(type)) return null;
    const bytes = await readLimited(res);
    return bytes ? `data:${type};base64,${bytes.toString("base64")}` : null;
  } catch { return null; }
}
