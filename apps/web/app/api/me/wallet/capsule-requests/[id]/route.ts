import { capsuleRoute } from "@/server/group-capsule/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return capsuleRoute("receipt", request, undefined, (await context.params).id); }
