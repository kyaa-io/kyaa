import { onlineCreatorsRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return onlineCreatorsRoute(request); }
