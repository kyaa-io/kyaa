import { capsuleRoute } from "@/server/group-capsule/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return capsuleRoute("list", request); }
