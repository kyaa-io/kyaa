import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { resolveCreatorId } from "@/server/dukjil/creator-id";
import { loadServerEnv } from "@/server/config/env";
import { createRankingsHandlers } from "./routes";

export function createRankingsRouteHandlers() {
  const { rpc, authorize } = createFanpageDependencies();
  return createRankingsHandlers({ profileRefSecret: loadServerEnv().PRIVY_APP_SECRET, rpc, authorize, resolveCreatorId, refreshOnRead: process.env.APP_ENV === "dev" });
}
