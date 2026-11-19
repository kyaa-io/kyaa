import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createChemiProfileHandlers } from "./handlers";

export function chemiProfileRoute(name: keyof ReturnType<typeof createChemiProfileHandlers>, request: Request) {
  const { rpc, authorize } = createFanpageDependencies();
  return createChemiProfileHandlers({ rpc, authorize })[name](request);
}
