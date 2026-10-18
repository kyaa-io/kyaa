import "server-only";

import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createMobileContentHandlers } from "./routes";

export function createMobileContentRouteHandlers() {
  const deps = createFanpageDependencies();
  return createMobileContentHandlers({ authorize: deps.authorize, rpc: deps.rpc });
}

export const mobileContentUnavailable = () => Response.json(
  { error: { code: "FAN_WEB_UNAVAILABLE" } },
  { status: 503, headers: { "cache-control": "private, no-store", vary: "Authorization" } },
);
