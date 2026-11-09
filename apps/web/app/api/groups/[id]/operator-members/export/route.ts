import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id?: string }> }) { return groupRoute("operator-members-export", request, await context.params); }
