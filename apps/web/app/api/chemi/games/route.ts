import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { getMatchPhotos } from "@/app/chemi/games/match/photos";
import { verify } from "@/features/chemi/games/engine";
import { boundedJson } from "@/server/certification/certification-http";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

const shareId = z.string().regex(/^[a-f0-9]{32}$/);
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lobby") }),
  z.object({ action: z.literal("ranking") }),
  z.object({ action: z.literal("sound"), sound: z.boolean() }),
  z.object({ action: z.literal("start"), game: z.literal("match"), character: z.enum(["changha", "elina", "yuna"]), key: z.uuid(), extra: z.boolean() }),
  z.object({ action: z.literal("leave"), playId: z.uuid() }),
  z.object({ action: z.literal("finish"), playId: z.uuid(), ticks: z.int(), score: z.int(), moves: z.array(z.tuple([z.int(), z.int()])).max(600) }),
  z.object({ action: z.literal("challenge"), shareId }),
  z.object({ action: z.literal("trial"), shareId, key: z.uuid() }),
]);

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!getMatchPhotos()) return reply({}, 404);
  try {
    const parsed = command.safeParse(await boundedJson(request, 16384).catch(() => null));
    if (!parsed.success) return reply({}, 400);
    const body = parsed.data;
    const { authorize, rpc } = createFanpageDependencies(request);
    if (body.action === "ranking") {
      return reply({ ranking: await rpc("chemi_match_ranking", { p_viewer: null, p_friend: null }) });
    }
    if (body.action === "challenge" || body.action === "trial") {
      const result = await rpc("chemi_match_challenge", { p_share: body.shareId, p_key: body.action === "trial" ? body.key : null });
      return result ? reply(result) : reply({}, 404);
    }
    const { appUserId: p_user } = await authorize(request.headers.get("authorization"));
    const info = (playId: string) => rpc("chemi_match_info", { p_user, p_play: playId }) as Promise<{ playId: string; seed: number; issuedAt: string; status: string } | null>;
    switch (body.action) {
      case "lobby":
      case "sound":
        return reply(await rpc("chemi_match_lobby", { p_user, p_sound: body.action === "sound" ? body.sound : null }));
      case "leave":
        return reply(await rpc("chemi_match_leave", { p_user, p_play: body.playId }));
      case "start": {
        const ticket = await rpc("chemi_issue_play", {
          p_user, p_game: "match", p_request_key: body.key, p_character: body.character, p_extra: body.extra,
        }) as { playId: string };
        const issued = await info(ticket.playId);
        return issued?.status === "issued" ? reply(issued) : reply({ error: "CHEMI_INVALID" }, 409);
      }
      case "finish": {
        const ticket = await info(body.playId);
        if (!ticket) return reply({}, 404);
        let result;
        try {
          result = verify(ticket.seed, body.ticks, body.moves, body.score, Date.now() - Date.parse(ticket.issuedAt));
        } catch {
          return reply({ error: "INVALID_REPLAY" }, 422);
        }
        return reply(await rpc("chemi_match_finish", { p_user, p_play: body.playId, p_score: result.score,
          p_log: { ticks: result.tick, misses: result.misses, pairs: result.pairs, moves: body.moves } }));
      }
    }
  } catch (e) {
    if (e instanceof AuthError) return reply({ error: e.code }, e.status);
    const message = e instanceof Error ? e.message : "";
    if (message.includes("GROUP_WALLET_INSUFFICIENT_BALANCE")) return reply({ error: "INSUFFICIENT_POINTS" }, 409);
    if (message.includes("CHEMI_ACCOUNT_CLOSED")) return reply({ error: "CHEMI_ACCOUNT_CLOSED" }, 403);
    if (message.includes("CHEMI_LIMIT")) return reply({ error: "CHEMI_LIMIT" }, 409);
    if (message.includes("CHEMI_INVALID") || message.includes("CHEMI_REQUEST_KEY_REUSED")) return reply({ error: "CHEMI_INVALID" }, 409);
    return reply({ error: "CHEMI_UNAVAILABLE" }, 503);
  }
}
