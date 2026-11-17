import { AuthError } from "@/features/auth/domain/auth-errors";
import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  try {
    const { authorize, rpc } = createFanpageDependencies();
    const { appUserId } = await authorize(request.headers.get("authorization"));
    return Response.json(await rpc("chemi_rewards_today", { p_user: appUserId }), { headers });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return Response.json({ error: { code: error instanceof AuthError ? error.code : "CHEMI_UNAVAILABLE" } }, { status, headers });
  }
}
