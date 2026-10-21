import "server-only";
import { waveStagePresentationResponseSchema, waveStagePresentationScopeSchema } from "@/features/wave-stage/domain/presentation";
import { correlation, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";

export function createWaveStagePresentationHandler(deps: Pick<FanpageDependencies, "authorizeAdmin" | "rpc">) {
  return async (request: Request) => {
    try {
      const admin = await deps.authorizeAdmin(request.headers.get("authorization"), correlation(request));
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some((key) => key !== "scope") || params.getAll("scope").length > 1) throw new Error("FAN_WEB_INVALID_INPUT");
      const scope = waveStagePresentationScopeSchema.parse(params.get("scope") ?? "all");
      const result = await deps.rpc("read_admin_wave_stage_participation", {
        p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId, p_scope: scope,
      });
      const parsed = waveStagePresentationResponseSchema.safeParse(result);
      if (!parsed.success || parsed.data.scope !== scope) throw new Error("FAN_WEB_UNAVAILABLE");
      return json(parsed.data);
    } catch (error) {
      return contentFailure(error);
    }
  };
}
