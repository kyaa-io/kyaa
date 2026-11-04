import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "../config/env";
import { createChannelAssetHandler } from "./channel-asset";
import { createOperatorAuthorizer } from "./operator-dependencies";

export function createChannelAssetDependencies() {
  const env = loadServerEnv();
  const authorizer = createOperatorAuthorizer();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) }) },
  });
  return createChannelAssetHandler({
    authorize: (authorization, correlationId, celebrityId) => authorizer.authorize(authorization, correlationId, celebrityId),
    async readAsset(session, celebrityId, assetId) {
      const { data, error } = await db.rpc("read_channel_content_asset", {
        p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId,
        p_celebrity_id: celebrityId, p_asset_id: assetId,
      });
      if (error) throw new Error(error.message === "active channel operator required" ? error.message : "unavailable");
      return data;
    },
    async download(path) {
      const { data, error } = await db.storage.from("fan-content-assets").download(path);
      if (error || !data) throw new Error("unavailable");
      return data;
    },
  });
}
