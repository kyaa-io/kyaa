import { groupActivityRoute } from "@/server/group-activities/dependencies";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string; itemId?: string }> }) { return groupActivityRoute("event-approval-review", request, await context.params); }
