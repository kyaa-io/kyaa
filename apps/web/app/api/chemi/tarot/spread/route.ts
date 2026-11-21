import { rewardRoute } from "@/server/chemi-reading/routes";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return rewardRoute("tarotSpread", request);
}

export function POST(request: Request) {
  return rewardRoute("tarotSpread", request);
}
