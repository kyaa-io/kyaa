import { rewardRoute } from "@/server/chemi-reading/routes";

export function POST(request: Request) {
  return rewardRoute("pointDate", request);
}

export function GET(request: Request) {
  return rewardRoute("datePrice", request);
}
