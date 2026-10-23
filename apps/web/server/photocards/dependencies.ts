import "server-only";
import { createClient } from "@/server/data/client";
import { storageObjectResponse } from "@/server/storage/transport";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { loadServerEnv } from "@/server/config/env";
import { MAX_PHOTOCARD_BYTES } from "./image";
import { createPhotocardReadHandler } from "./routes";

export function createPhotocardRead() {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return createPhotocardReadHandler({
    ...createFanpageDependencies(),
    async download(path) {
      const response = await storageObjectResponse({ database, url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }, "cheer-photocards", path, { signal: AbortSignal.timeout(10000) });
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
