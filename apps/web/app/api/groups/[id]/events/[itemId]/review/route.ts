import { groupActivityRoute } from "@/server/group-activities/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string; itemId?: string; subId?: string }> }) { return groupActivityRoute("event-review-write", request, await context.params); }
