import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { resolveCreatorId } from "@/server/dukjil/creator-id";
import { createRankingsHandlers } from "./routes";

export function createRankingsRouteHandlers() {
  const { rpc, authorize } = createFanpageDependencies();
  return createRankingsHandlers({ rpc, authorize, resolveCreatorId, refreshOnRead: process.env.APP_ENV === "dev" });
}
