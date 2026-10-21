import "server-only";
import { z } from "zod";
import { correlation, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const resultSchema = z.object({ id: z.uuid(), bingoCompletedAt: z.iso.datetime({ offset: true }) }).strict();
export function createWaveBingoStampHandler(deps: Pick<FanpageDependencies, "authorizeAdmin" | "rpc">) {
  return async (request: Request, participantId: string) => {
    try {
      const correlationId = correlation(request);
      const actor = await deps.authorizeAdmin(request.headers.get("authorization"), correlationId);
      const id = z.uuid().parse(participantId);
      const result = await deps.rpc("grant_admin_kyaa_wave_bingo_stamp", {
        p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId,
        p_participant_id: id, p_correlation_id: correlationId,
      });
      const checked = resultSchema.safeParse(result);
      if (!checked.success || checked.data.id !== id) throw new Error("FAN_WEB_UNAVAILABLE");
      return json(checked.data);
    } catch (error) { return contentFailure(error); }
  };
}
