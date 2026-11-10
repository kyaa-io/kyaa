import { createGetGiftHandler, giftUnavailable } from "@/server/gifts/gift-route";
import { createGiftRouteDependencies } from "@/server/gifts/gift-route-dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ rewardResultId: string }> }) {
  try { return await createGetGiftHandler(createGiftRouteDependencies())(request, await context.params); }
  catch { return giftUnavailable(); }
}
