import { capsuleRoute } from "@/server/group-capsule/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return capsuleRoute("fulfillments", request); }
export async function PATCH(request: Request) { return capsuleRoute("fulfill", request); }
