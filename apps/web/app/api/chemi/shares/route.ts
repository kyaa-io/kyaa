import { rewardRoute } from "@/server/chemi-reading/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return rewardRoute("share", request);
}
