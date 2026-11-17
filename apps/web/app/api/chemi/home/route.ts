import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

export const dynamic = "force-dynamic";

export async function GET() {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  const participation = await createFanpageDependencies().rpc("chemi_participation", {});
  return Response.json({ participation }, { headers: { "cache-control": "public, max-age=60" } });
}
