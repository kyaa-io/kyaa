import "server-only";
import { waveStageDrawRequestSchema, waveStageResponseSchema } from "@/features/wave-stage/domain/wave-stage";
import { boundedJson, correlation, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";

export function createWaveStageHandlers(deps: Pick<FanpageDependencies, "authorizeAdmin" | "rpc">) {
  const run = (draw: boolean) => async (request: Request) => {
    try {
      const correlationId = correlation(request);
      const admin = await deps.authorizeAdmin(request.headers.get("authorization"), correlationId);
      if (draw && admin.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403);
      const args = { p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId };
      const body = draw ? waveStageDrawRequestSchema.parse(await boundedJson(request)) : null;
      const result = await deps.rpc(draw ? "execute_admin_wave_stage_draw" : "read_admin_wave_stage", {
        ...args,
        ...(body ? { p_correlation_id: correlationId, p_idempotency_key: body.idempotencyKey,
          p_changha_revision: body.expectedRevisions.changha, p_wena_revision: body.expectedRevisions.wena } : {}),
      });
      const parsed = waveStageResponseSchema.safeParse(result);
      if (!parsed.success) throw new Error("FAN_WEB_UNAVAILABLE");
      return json(parsed.data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("WAVE_STAGE_EMPTY_CAMPAIGN"))
        return json({ error: { code: "WAVE_STAGE_EMPTY_CAMPAIGN" } }, 409);
      return contentFailure(error);
    }
  };
  return { read: run(false), draw: run(true) };
}
