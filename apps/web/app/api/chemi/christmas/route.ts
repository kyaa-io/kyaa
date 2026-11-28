import { rewardRoute } from "@/server/chemi-reading/routes";

export function GET(request: Request) {
  return rewardRoute("christmas", request);
}
