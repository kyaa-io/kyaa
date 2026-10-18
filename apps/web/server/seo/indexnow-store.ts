import "server-only";
import { createClient } from "@supabase/supabase-js";
import { validatePublicationSnapshot, type IndexNowStore } from "./indexnow";

interface RpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
export function createIndexNowStore(database: RpcClient): IndexNowStore {
  return {
    async claim(token) {
      const { data, error } = await database.rpc("claim_search_indexnow", { p_token: token });
      if (error || !data || typeof data !== "object" || !("acquired" in data)) throw new Error("INDEXNOW_STORE_UNAVAILABLE");
      if (data.acquired === false) return null;
      if (data.acquired !== true || !("snapshot" in data)) throw new Error("INDEXNOW_STORE_UNAVAILABLE");
      return validatePublicationSnapshot(data.snapshot, true);
    },
    async acknowledge(token, snapshot) {
      const { data, error } = await database.rpc("acknowledge_search_indexnow", { p_token: token, p_snapshot: snapshot });
      if (error || typeof data !== "boolean") throw new Error("INDEXNOW_STORE_UNAVAILABLE");
      return data;
    },
    async release(token) {
      const { error } = await database.rpc("release_search_indexnow", { p_token: token });
      if (error) throw new Error("INDEXNOW_STORE_UNAVAILABLE");
    },
  };
}

export function createIndexNowStoreFromEnvironment(): IndexNowStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("INDEXNOW_STORE_NOT_CONFIGURED");
  return createIndexNowStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
