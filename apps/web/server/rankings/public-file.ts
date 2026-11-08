import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const files = new Map<string, Promise<ArrayBuffer>>();

/**
 * A file under public/ as bytes, kept per process. From disk first: `next start` runs in apps/web, and the standalone server.js chdirs to its own
 * folder, where Dockerfile.aws copies public/. If the file is not there, the same server answers it over HTTP. A failure is not kept.
 */
export function publicFile(path: `public/${string}`, origin: string, read: (path: string) => Promise<Uint8Array> = (p) => readFile(join(process.cwd(), p)), get: typeof fetch = fetch) {
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
