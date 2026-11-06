import { createJjinfanCampaignDependencies } from "@/server/rankings/jjinfan-campaigns-dependencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return createJjinfanCampaignDependencies().list(request);
}
