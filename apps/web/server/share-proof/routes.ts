import "server-only";
import { z } from "zod";
import { checkShareProofUrl, SHARE_PROOF_STATUSES, shareProofListSchema, shareProofResultSchema, shareProofSubmitSchema } from "@/features/share-proof/domain/share-proof";
import { creatorSlugSchema } from "@/features/passport/domain/dukjil-types";
import { boundedJson } from "@/server/certification/certification-http";
import { resolveCreatorId } from "@/server/dukjil/creator-id";

export interface ShareProofDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  resolveCreatorId?(slug: string): Promise<string | null>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const STATUS: Record<string, number> = {
  SHARE_PROOF_URL_SHORT: 422, SHARE_PROOF_URL_UNSUPPORTED: 422, SHARE_PROOF_URL_NOT_POST: 422, SHARE_PROOF_OWN_POST_REQUIRED: 400,
  SHARE_PROOF_URL_REUSED: 409, PASSPORT_REQUIRED: 403, CREATOR_NOT_FOUND: 404, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403,
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
// duplicate: the same post was sent as an Instagram repost (B3); the database answers it as a closed replay and nothing is paid.
const storedSchema = z.object({ id: z.uuid(), replayed: z.boolean(), points: z.number().int().nonnegative().nullable(), status: z.enum(SHARE_PROOF_STATUSES), duplicate: z.boolean().optional() });

/** 261107-2 D12 (review r4 H2) and DUKJIL-POLICY ④. The share mission is proven by the fan's own post on one of five networks: the address is
 * reduced to the network's post id here and kept as a pending proof, one post for one member across all members. Nothing is paid here:
 * an operator checks the official tag and accepts it (server/share-proof/admin.ts), and only then the unchanged dukjil payout runs. */
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
      return Response.json(shareProofResultSchema.parse({ id: stored.id, replayed: stored.replayed, status: stored.status, ...(stored.duplicate ? { duplicate: true } : {}) }), { status: stored.replayed ? 200 : 201, headers });
    }),
  };
}
