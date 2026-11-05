import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createDukjilHandlers } from "./routes";

export function createDukjilRouteHandlers() {
  const { rpc, authorize } = createFanpageDependencies();
  return createDukjilHandlers({ rpc, authorize });
}
