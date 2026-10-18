import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createMobileParticipationHandlers } from "./routes";
import { processParticipationCompletions } from "./worker";
import { loadServerEnv } from "@/server/config/env";

export function createMobileParticipationRouteHandlers() {
  const deps = createFanpageDependencies();
  return createMobileParticipationHandlers({ authorize: deps.authorize, rpc: deps.rpc, applicationOrigin: loadServerEnv().NEXT_PUBLIC_APP_URL });
}
export const mobileParticipationUnavailable = () => Response.json({ error: { code: "PARTICIPATION_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store", vary: "Authorization" } });

export async function runMobileParticipationCompletion(limit = 25) {
  const deps = createFanpageDependencies();
  return processParticipationCompletions({ rpc: deps.rpc }, limit);
}
