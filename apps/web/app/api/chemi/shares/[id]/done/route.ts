import { rewardRoute } from "@/server/chemi-reading/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return rewardRoute("done", request, (await context.params).id);
}
