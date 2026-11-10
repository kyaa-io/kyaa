import { createListGiftsHandler, giftUnavailable } from "@/server/gifts/gift-route";
import { createGiftRouteDependencies } from "@/server/gifts/gift-route-dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await createListGiftsHandler(createGiftRouteDependencies())(request); }
  catch { return giftUnavailable(); }
}
