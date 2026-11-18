import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { serializeMetadata } from "@/server/chemi-chain/metadata";
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  const { id } = await context.params;
  const match =
    /^0{32}([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/.exec(
      id,
    );
  const headers = { "cache-control": "no-store" };
  if (!match) return new Response(null, { status: 404, headers });
  const data = await createFanpageDependencies().rpc("chemi_chain_metadata", {
    p_id: match.slice(1).join("-"),
  });
  if (!data) return new Response(null, { status: 404, headers });
  return Response.json(serializeMetadata(data), { headers });
}
