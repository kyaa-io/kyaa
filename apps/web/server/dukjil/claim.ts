import "server-only";
import { z } from "zod";
import type { RewardedExchangeDecision } from "@/features/group-wallet/rewarded-config";
import { boundedJson } from "@/server/certification/certification-http";
import { dukjilFailure, type DukjilDependencies } from "./routes";
import { passportIdSchema, resolveOwnedCreator } from "./roadmap";

// Contract §3.4: one heart per page; hearts go to creator_heart_ledger and never to the wallet. A replay returns the first result with replayed:true.
// 대표 11/11 + 감독 11:46: a heart needs a rewarded ad, the ticket exchange's contract. The page gets its own server session
// (issue → shown → granted on rewardedSlotGranted), and claim_passport_page_with_ad consumes it once with the heart (20261223100000).
export const claimBodySchema = z.object({ requestKey: z.uuid(), adSessionId: z.uuid().optional() }).strict();
const reportBodySchema = z.object({ sessionId: z.uuid(), event: z.enum(["shown", "granted"]) }).strict();
export const pageNoSchema = z.coerce.number().int().min(1).max(999);
export const claimResultSchema = z.object({
  hearts: z.literal(1), pageNo: z.number().int().min(1), jjinfanConfirmed: z.boolean(), cheerStampId: z.uuid().nullable(), replayed: z.boolean(),
}).strict();
export type PassportClaimResult = z.infer<typeof claimResultSchema>;

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };

export type ClaimDependencies = DukjilDependencies & { rewardedExchange?: RewardedExchangeDecision };

export function createClaimHandler(deps: ClaimDependencies) {
  /** Closed or unconfigured ad settings refuse before the database: no session, no ad, no heart. */
  function openAds() {
    const decision = deps.rewardedExchange;
    if (decision?.enabled === true) return decision.session;
    throw new Error(decision?.reason === "config_missing" ? "GROUP_WALLET_AD_CONFIG_MISSING" : "GROUP_WALLET_AD_GATE_CLOSED");
  }
  async function owned(request: Request, passportId: string) {
    const { appUserId } = await deps.authorize(request.headers.get("authorization"));
    return { appUserId, celebrityId: await resolveOwnedCreator(deps, appUserId, passportIdSchema.parse(passportId)) };
  }
  const sessionSchema = z.object({ sessionId: z.uuid(), status: z.enum(["issued", "shown", "granted", "invalid"]), expiresAt: z.string() }).strict();
  return {
    adSession: async (request: Request, passportId: string, pageNo: string) => {
      try {
        const page = pageNoSchema.parse(pageNo);
        await boundedJson(request, 1024);
        const session = openAds();
        const { appUserId, celebrityId } = await owned(request, passportId);
        const raw = await deps.rpc("issue_owned_passport_claim_ad_session", { p_user: appUserId, p_celebrity: celebrityId, p_page_no: page, p_ttl_seconds: session.ttlSeconds, p_issue_limit: session.issueLimit, p_issue_window_seconds: session.issueWindowSeconds });
        const parsed = sessionSchema.safeParse(raw);
        if (!parsed.success) throw new Error("DUKJIL_UNAVAILABLE");
        return Response.json(parsed.data, { headers: privateHeaders });
      } catch (error) {
        return dukjilFailure(error);
      }
    },
    adSessionReport: async (request: Request) => {
      try {
        const body = reportBodySchema.parse(await boundedJson(request, 1024));
        const session = openAds();
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        const raw = await deps.rpc("report_owned_passport_claim_ad_session", { p_user: appUserId, p_session_id: body.sessionId, p_event: body.event, p_min_watch_seconds: session.minWatchSeconds });
        const parsed = sessionSchema.safeParse(raw);
        if (!parsed.success) throw new Error("DUKJIL_UNAVAILABLE");
        return Response.json(parsed.data, { headers: privateHeaders });
      } catch (error) {
        return dukjilFailure(error);
      }
    },
    claim: async (request: Request, passportId: string, pageNo: string) => {
      try {
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        const id = passportIdSchema.parse(passportId);
        const page = pageNoSchema.parse(pageNo);
        const body = claimBodySchema.parse(await boundedJson(request, 1024));
        openAds();
        if (!body.adSessionId) throw new Error("GROUP_WALLET_AD_SESSION_REQUIRED");
        // Ownership and the creator behind the passport come from the owner's own passport row, never from the client.
        const celebrityId = await resolveOwnedCreator(deps, appUserId, id);
        const raw = await deps.rpc("claim_passport_page_with_ad", { p_user: appUserId, p_celebrity: celebrityId, p_page_no: page, p_request_key: body.requestKey, p_ad_session_id: body.adSessionId });
        const parsed = claimResultSchema.safeParse(raw);
        if (!parsed.success) throw new Error("DUKJIL_UNAVAILABLE");
        return Response.json(parsed.data, { headers: privateHeaders });
      } catch (error) {
        return dukjilFailure(error);
      }
    },
  };
}
