import { rewardRoute } from "@/server/chemi-reading/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return rewardRoute("detail", request, (await context.params).id);
}
