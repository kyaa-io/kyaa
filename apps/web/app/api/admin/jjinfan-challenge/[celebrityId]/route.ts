import { createJjinfanCampaignDependencies } from "@/server/rankings/jjinfan-campaigns-dependencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ celebrityId: string }> }) {
  return createJjinfanCampaignDependencies().save(request, (await context.params).celebrityId);
}
