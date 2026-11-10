import "server-only";
import { awardDukjilActionDetailed } from "@/server/dukjil/award";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type ShareProofPayout = { points: number; skippedReason?: "too_short" | "daily_limit" | "same_body" | "passport_required" };

/**
 * Pays one accepted share proof (the unchanged dukjil share rule). The payout runs inside pay_fan_share_proof: it locks the proof,
 * refuses a proof that is not accepted and pays with the proof's own creator, so an operator's cancel and this payout never interleave
 * (review r4b M1, M2). awardDukjilActionDetailed keeps the failure record and the skip reasons; only its database call is routed
 * through the locked function. A refusal (daily cap, passport) closes the proof at 0P so a later request cannot pay it; a transient
 * failure leaves it open for the retry (an accepted proof with no points answers a replayed accept, which pays again).
 */
export async function payShareProof(rpc: Rpc, proof: { id: string; appUserId: string; creatorId: string; creatorSlug: string; platform: string }): Promise<ShareProofPayout> {
  const locked = { rpc: (name: string, args: Record<string, unknown>) => name === "record_dukjil_action"
    ? rpc("pay_fan_share_proof", { p_app_user_id: proof.appUserId, p_proof_id: proof.id, p_request_key: args.p_request_key, p_params: args.p_params })
    : rpc(name, args), resolveCreatorId: async () => proof.creatorId };
  const award = await awardDukjilActionDetailed(locked, { appUserId: proof.appUserId, creatorSlug: proof.creatorSlug, actionKey: "share", sourceKey: `share-proof:${proof.id}`, params: { platform: proof.platform } });
  const result = award.result;
  const paid = result && !result.replayed && result.points > 0 ? result.points : 0;
  const skippedReason = paid ? undefined : award.skipped ?? (result?.capped ? "daily_limit" : undefined);
  if (!paid && (skippedReason || result)) { try { await rpc("set_fan_share_proof_points", { p_app_user_id: proof.appUserId, p_id: proof.id, p_points: 0 }); } catch { /* stays open */ } }
  return { points: paid, ...(skippedReason ? { skippedReason } : {}) };
}
