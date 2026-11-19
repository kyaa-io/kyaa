import { rewardRoute } from "@/server/chemi-reading/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return rewardRoute("list", request);
}

export async function POST(request: Request) {
  return rewardRoute("createReading", request);
}
