import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedJson } from "@/server/certification/certification-http";
import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };
const command = z.object({ action: z.literal("adopt"), character: z.enum(["changha", "elina", "yuna"]) });

function failure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
  const closed = error instanceof Error && error.message.includes("CHEMI_ACCOUNT_CLOSED");
  return Response.json({ error: { code: closed ? "CHEMI_ACCOUNT_CLOSED" : "CHEMI_UNAVAILABLE" } }, { status: closed ? 403 : 503, headers });
}

export async function GET(request: Request) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  try {
    const { authorize, rpc } = createFanpageDependencies(request);
    const params = new URL(request.url).searchParams;
    if (params.has("period")) {
      const period = z.enum(["week", "all"]).safeParse(params.get("period"));
      const character = command.shape.character.safeParse(params.get("character"));
      if (!period.success || !character.success) return Response.json({}, { status: 400, headers });
      const token = request.headers.get("authorization");
      const viewer = token ? (await authorize(token)).appUserId : null;
      return Response.json(await rpc("chemi_growth_ranking", {
        p_viewer: viewer, p_character: character.data, p_period: period.data,
      }), { headers });
    }
    const { appUserId } = await authorize(request.headers.get("authorization"));
    return Response.json(await rpc("chemi_grow_state", { p_user: appUserId }), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  try {
    const parsed = command.safeParse(await boundedJson(request, 1024).catch(() => null));
    if (!parsed.success) return Response.json({ error: { code: "CHEMI_INVALID" } }, { status: 400, headers });
    const { authorize, rpc } = createFanpageDependencies(request);
    const { appUserId } = await authorize(request.headers.get("authorization"));
    return Response.json(await rpc("chemi_grow_adopt", { p_user: appUserId, p_character: parsed.data.character }), { headers });
  } catch (error) {
    return failure(error);
  }
}
