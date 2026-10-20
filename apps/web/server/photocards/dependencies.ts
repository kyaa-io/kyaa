import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { loadServerEnv } from "@/server/config/env";
import { MAX_PHOTOCARD_BYTES } from "./image";
import { createPhotocardReadHandler } from "./routes";

export function createPhotocardRead() {
  const env = loadServerEnv();
  return createPhotocardReadHandler({
    ...createFanpageDependencies(),
    async download(path) {
      const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/cheer-photocards/${path.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || !response.body) throw new Error("PHOTOCARD_UNAVAILABLE");
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_PHOTOCARD_BYTES) { await reader.cancel(); throw new Error("PHOTOCARD_UNAVAILABLE"); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      return Buffer.concat(chunks);
    },
  });
}
