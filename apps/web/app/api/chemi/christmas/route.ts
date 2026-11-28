import { rewardRoute } from "@/server/chemi-reading/routes";

export function POST(request: Request) {
  return rewardRoute("christmas", request);
}
