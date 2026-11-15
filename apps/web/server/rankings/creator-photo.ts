import "server-only";
import { publicFile } from "./public-file";

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
    const res = await fetch(src, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/png", "image/jpeg"].includes(type)) return null;
    return `data:${type};base64,${base64(await res.arrayBuffer())}`;
  } catch { return null; }
}
