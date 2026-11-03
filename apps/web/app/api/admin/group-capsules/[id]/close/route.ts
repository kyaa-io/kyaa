import { capsuleRoute } from "@/server/group-capsule/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return capsuleRoute("close", request, (await context.params).id); }
