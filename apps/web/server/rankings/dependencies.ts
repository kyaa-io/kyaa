import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { resolveCreatorId } from "@/server/dukjil/creator-id";
import { loadServerEnv } from "@/server/config/env";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createRankingsHandlers } from "./routes";

export function createRankingsRouteHandlers() {
  const { rpc, authorize } = createFanpageDependencies();
  return createRankingsHandlers({ profileRefSecret: loadServerEnv().PRIVY_APP_SECRET, rpc, authorize, resolveCreatorId, readFanCounts: async () => new Map((await createPublishedContentRepositoryFromEnvironment().list("ko")).map((creator) => [creator.slug, creator.fanCount])), refreshOnRead: process.env.APP_ENV === "dev" });
}
