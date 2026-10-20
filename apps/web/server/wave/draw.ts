import "server-only";
import { z } from "zod";
import { waveAdminDrawResponseSchema, waveDrawResponseSchema, wavePreferencesSchema } from "@/features/fanpage/domain/wave-draw";
import { boundedJson, correlation, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const requestSchema = z.object({ requestId: z.uuid() }).strict();
export function createWaveDrawHandlers(deps: Pick<FanpageDependencies, "authorize" | "authorizeAdmin" | "rpc">) {
  const run = async (action: () => Promise<unknown>) => {
    try { return json(await action()); } catch (error) { return contentFailure(error); }
  };
  const checked = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error("FAN_WEB_UNAVAILABLE");
    return result.data;
  };
  const admin = async (request: Request) => {
    const correlationId = correlation(request);
    const session = await deps.authorizeAdmin(request.headers.get("authorization"), correlationId);
    return { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_correlation_id: correlationId };
  };
  return {
    read: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      return checked(waveDrawResponseSchema, await deps.rpc("read_owned_kyaa_wave_draw", { p_app_user_id: appUserId }));
    }),
    save: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const input = requestSchema.extend({ preferences: wavePreferencesSchema }).strict().parse(await boundedJson(request));
      return checked(waveDrawResponseSchema, await deps.rpc("save_owned_kyaa_wave_draw_preferences", { p_app_user_id: appUserId, p_preferences: input.preferences, p_request_id: input.requestId }));
    }),
    adminRead: (request: Request) => run(async () => {
      const args = await admin(request);
      return checked(waveAdminDrawResponseSchema, await deps.rpc("read_admin_kyaa_wave_draw", { p_actor_app_user_id: args.p_actor_app_user_id, p_actor_admin_allowlist_id: args.p_actor_admin_allowlist_id }));
    }),
    execute: (request: Request) => run(async () => {
      const args = await admin(request);
      const input = requestSchema.parse(await boundedJson(request));
      return checked(waveAdminDrawResponseSchema, await deps.rpc("execute_admin_kyaa_wave_draw", { ...args, p_request_id: input.requestId }));
    }),
    reveal: (request: Request) => run(async () => {
      const args = await admin(request);
      const input = requestSchema.extend({ drawId: z.uuid(), prizeIndex: z.number().int().min(1).max(10) }).strict().parse(await boundedJson(request));
      return checked(waveAdminDrawResponseSchema, await deps.rpc("reveal_admin_kyaa_wave_draw", { ...args, p_draw_id: input.drawId, p_prize_index: input.prizeIndex, p_request_id: input.requestId }));
    }),
  };
}
