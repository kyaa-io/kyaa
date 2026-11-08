import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const files = new Map<string, Promise<ArrayBuffer>>();

/** This server itself, never the request's Host: a forged Host must not decide which bytes are kept for every later request. */
export function internalOrigin(port = process.env.PORT) {
  return `http://127.0.0.1:${/^\d{2,5}$/.test(port ?? "") ? port : "3000"}`;
}

/**
 * A file under public/ as bytes, kept per process. From disk first: `next start` runs in apps/web, and the standalone server.js chdirs to its own
 * folder, where Dockerfile.aws copies public/. If the file is not there, this server answers it over HTTP on its internal address. A failure is not kept.
 */
export function publicFile(path: `public/${string}`, origin: string = internalOrigin(), read: (path: string) => Promise<Uint8Array> = (p) => readFile(join(process.cwd(), p)), get: typeof fetch = fetch) {
  let hit = files.get(path);
  if (!hit) {
    hit = read(path).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
      .catch(async () => {
        const res = await get(new URL(path.slice("public".length), origin));
        if (!res.ok) throw new Error("PUBLIC_FILE_UNAVAILABLE");
        return res.arrayBuffer();
      });
    hit.catch(() => files.delete(path));
    files.set(path, hit);
  }
  return hit;
}

/** Tests only. */
export function forgetPublicFiles() { files.clear(); }
