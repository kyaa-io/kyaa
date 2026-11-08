import "server-only";
import { z } from "zod";
import { parseShareProofUrl, shareProofListSchema, shareProofResultSchema, shareProofSubmitSchema } from "@/features/share-proof/domain/share-proof";
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
const STATUS: Record<string, number> = { SHARE_PROOF_URL_INVALID: 422, SHARE_PROOF_URL_USED: 409, PASSPORT_REQUIRED: 403, CREATOR_NOT_FOUND: 404, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, AUTHENTICATION_REQUIRED: 401, INVALID_REQUEST: 400 };
function failure(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  if (error instanceof Error && error.name === "AuthError") return Response.json({ error: { code: status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN" } }, { status: typeof status === "number" ? status : 401, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers });
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find(known => message.includes(known));
  return code ? Response.json({ error: { code } }, { status: STATUS[code], headers }) : Response.json({ error: { code: "SHARE_PROOF_UNAVAILABLE" } }, { status: 503, headers });
}

/** 261107-2 D12. The share mission pays for a post the fan put on a social network: the address is checked here, kept once in
 * fan_share_proofs, then the unchanged dukjil payout decides (share rule: points, daily cap, stamp). */
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
      const proof = parseShareProofUrl(body.url);
      if (!proof) throw new Error("SHARE_PROOF_URL_INVALID");
      const celebrity = await creator(body.creator);
      const stored = z.object({ id: z.uuid(), replayed: z.boolean(), points: z.number().int().nonnegative().nullable().optional() }).parse(await deps.rpc("submit_fan_share_proof", { p_app_user_id: appUserId, p_celebrity_id: celebrity, p_platform: proof.platform, p_url: proof.url, p_url_key: proof.key }));
      const written = { id: stored.id, replayed: stored.replayed };
      // A replay whose payout was never recorded (the request died after the row was written) pays now; the payout's request key
      // is fixed per proof, so a payout that did happen replays instead of paying twice.
      if (written.replayed && stored.points != null) return Response.json(shareProofResultSchema.parse(written), { status: 200, headers });
      const award = await awardDukjilActionDetailed({ ...deps, resolveCreatorId: async () => celebrity }, { appUserId, creatorSlug: body.creator, actionKey: "share", sourceKey: `share-proof:${written.id}`, params: { platform: proof.platform } });
      const result = award.result;
      const paid = result && !result.replayed && result.points > 0 ? result.points : 0;
      try { await deps.rpc("set_fan_share_proof_points", { p_app_user_id: appUserId, p_id: written.id, p_points: paid }); } catch { /* the list shows no amount */ }
      const skipped = paid ? undefined : award.skipped ?? (result?.capped ? "daily_limit" : undefined);
      return Response.json(shareProofResultSchema.parse({ ...written, ...(paid ? { reward: { points: paid, ...(result?.stampId ? { stamps: 1 } : {}) } } : {}), ...(skipped ? { rewardSkipped: skipped } : {}) }), { status: written.replayed ? 200 : 201, headers });
    }),
  };
}
