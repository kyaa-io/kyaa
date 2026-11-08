import "server-only";
import { z } from "zod";
import { checkShareProofUrl, shareProofListSchema, shareProofResultSchema, shareProofSubmitSchema, type MissionReward } from "@/features/share-proof/domain/share-proof";
import { creatorSlugSchema } from "@/features/passport/domain/dukjil-types";
import { boundedJson } from "@/server/certification/certification-http";
import { awardDukjilActionDetailed } from "@/server/dukjil/award";
import { resolveCreatorId } from "@/server/dukjil/creator-id";

export interface ShareProofDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  resolveCreatorId?(slug: string): Promise<string | null>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const STATUS: Record<string, number> = {
  SHARE_PROOF_URL_SHORT: 422, SHARE_PROOF_URL_UNSUPPORTED: 422, SHARE_PROOF_URL_NOT_POST: 422, SHARE_PROOF_OWN_POST_REQUIRED: 400,
  PASSPORT_REQUIRED: 403, CREATOR_NOT_FOUND: 404, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403,
};
function failure(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  if (error instanceof Error && error.name === "AuthError") return Response.json({ error: { code: status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN" } }, { status: typeof status === "number" ? status : 401, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    // The confirmation box is the one field a fan can leave out on purpose; name it so the screen can point at it.
    const own = error instanceof z.ZodError && error.issues.some(issue => issue.path[0] === "ownPost");
    return Response.json({ error: { code: own ? "SHARE_PROOF_OWN_POST_REQUIRED" : "INVALID_REQUEST" } }, { status: 400, headers });
  }
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find(known => message.includes(known));
  return code ? Response.json({ error: { code } }, { status: STATUS[code], headers }) : Response.json({ error: { code: "SHARE_PROOF_UNAVAILABLE" } }, { status: 503, headers });
}
const URL_CODE = { short: "SHARE_PROOF_URL_SHORT", unsupported: "SHARE_PROOF_URL_UNSUPPORTED", not_post: "SHARE_PROOF_URL_NOT_POST" } as const;
const storedSchema = z.object({ id: z.uuid(), replayed: z.boolean(), points: z.number().int().nonnegative().nullable(), status: z.enum(["accepted", "revoked"]) });

/** 261107-2 D12 (review r4 H2). The share mission pays for the fan's own post on one of five networks: the address is reduced to the
 * network's post id here, kept once per member in fan_share_proofs, then the unchanged dukjil payout decides (share rule). */
export function createShareProofHandlers(deps: ShareProofDependencies) {
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return failure(error); } };
  const creator = async (slug: string) => {
    const id = await (deps.resolveCreatorId ?? resolveCreatorId)(creatorSlugSchema.parse(slug));
    if (!id) throw new Error("CREATOR_NOT_FOUND");
    return id;
  };
  return {
    list: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const celebrity = await creator(new URL(request.url).searchParams.get("creator") ?? "");
      const parsed = shareProofListSchema.safeParse(await deps.rpc("list_fan_share_proofs", { p_app_user_id: appUserId, p_celebrity_id: celebrity }));
      if (!parsed.success) throw new Error("SHARE_PROOF_UNAVAILABLE");
      return Response.json(parsed.data, { headers });
    }),
    submit: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const body = shareProofSubmitSchema.parse(await boundedJson(request, 2048));
      const checked = checkShareProofUrl(body.url);
      if (!checked.ok) throw new Error(URL_CODE[checked.problem]);
      const proof = checked.value, celebrity = await creator(body.creator);
      const stored = storedSchema.parse(await deps.rpc("submit_fan_share_proof", { p_app_user_id: appUserId, p_celebrity_id: celebrity, p_platform: proof.platform, p_url: proof.url, p_url_key: proof.key, p_own_post: body.ownPost }));
      const written = { id: stored.id, replayed: stored.replayed };
      // A replay pays only when its payout never ran (the request died after the row was written); a cancelled proof never pays again.
      if (stored.replayed && (stored.points !== null || stored.status === "revoked")) return Response.json(shareProofResultSchema.parse(written), { status: 200, headers });
      // The payout runs inside pay_fan_share_proof: it locks the proof, refuses a cancelled one and pays with the proof's own creator,
      // so an operator's cancel and this payout never interleave (review r4b M1, M2). awardDukjilActionDetailed keeps the failure
      // record and the skip reasons; only its database call is routed through the locked function.
      const locked = { rpc: (name: string, args: Record<string, unknown>) => name === "record_dukjil_action"
        ? deps.rpc("pay_fan_share_proof", { p_app_user_id: appUserId, p_proof_id: stored.id, p_request_key: args.p_request_key, p_params: args.p_params })
        : deps.rpc(name, args), resolveCreatorId: async () => celebrity };
      const award = await awardDukjilActionDetailed(locked, { appUserId, creatorSlug: body.creator, actionKey: "share", sourceKey: `share-proof:${stored.id}`, params: { platform: proof.platform } });
      const result = award.result;
      const paid = result && !result.replayed && result.points > 0 ? result.points : 0;
      const skippedReason = paid ? undefined : award.skipped ?? (result?.capped ? "daily_limit" : undefined);
      // A refusal (daily cap, passport) closes the proof at 0P so a later resubmission cannot pay it; a transient failure leaves it open for the retry.
      if (!paid && (skippedReason || result)) { try { await deps.rpc("set_fan_share_proof_points", { p_app_user_id: appUserId, p_id: stored.id, p_points: 0 }); } catch { /* stays open */ } }
      const reward: MissionReward = { points: paid, stamps: paid && result?.stampId ? 1 : 0, ...(skippedReason ? { skippedReason } : {}) };
      return Response.json(shareProofResultSchema.parse({ ...written, reward }), { status: stored.replayed ? 200 : 201, headers });
    }),
  };
}
