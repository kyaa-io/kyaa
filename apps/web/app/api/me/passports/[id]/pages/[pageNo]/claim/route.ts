import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createClaimHandler } from "@/server/dukjil/claim";
import { dukjilFailure } from "@/server/dukjil/routes";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string; pageNo: string }> }) {
  try {
    const { rpc, authorize } = createFanpageDependencies();
    const { id, pageNo } = await context.params;
    return await createClaimHandler({ rpc, authorize }).claim(request, id, pageNo);
  } catch (error) { return dukjilFailure(error); }
}
