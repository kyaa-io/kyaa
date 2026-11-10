import { createReadGiftHandler, giftUnavailable } from "@/server/gifts/gift-route";
import { createGiftRouteDependencies } from "@/server/gifts/gift-route-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ rewardResultId: string }> }) {
  try { return await createReadGiftHandler(createGiftRouteDependencies())(request, await context.params); }
  catch { return giftUnavailable(); }
}
