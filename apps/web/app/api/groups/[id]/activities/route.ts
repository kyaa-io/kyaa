import { groupActivityRoute } from "@/server/group-activities/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; itemId?: string; subId?: string }> }) { return groupActivityRoute("activities", request, await context.params); }
