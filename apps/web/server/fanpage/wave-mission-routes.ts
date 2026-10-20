import "server-only";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { waveMissionProgressSchema } from "@/features/fanpage/domain/wave-missions";
import { json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "./routes";

export function createWaveMissionHandlers(deps: Pick<FanpageDependencies, "authorize" | "rpc">) {
  return {
    async progress(request: Request, slug: string) {
      try {
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        if (slug !== WAVE_FANPAGE_SLUG) throw new Error("FAN_WEB_NOT_FOUND");
        const result = waveMissionProgressSchema.safeParse(await deps.rpc("read_owned_kyaa_wave_missions", { p_app_user_id: appUserId }));
        if (!result.success) throw new Error("FAN_WEB_UNAVAILABLE");
        return json(result.data);
      } catch (error) { return contentFailure(error); }
    },
  };
}
