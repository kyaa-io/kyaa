import { createChannelAssetDependencies } from "../../../../../../../server/operator/channel-asset-dependencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await context.params;
  return createChannelAssetDependencies()(request, id, assetId);
}
