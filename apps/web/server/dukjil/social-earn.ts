import "server-only";
import { dukjilActionResultSchema, type DukjilActionResult } from "@/features/passport/domain/dukjil-types";

/** The four social actions that pay 1 point (EARN-SOCIAL-ACTIONS-1126). */
export type SocialEarnAction = "comment_like" | "comment_reply" | "friend_add" | "chat";

/**
 * Asks the database to pay one social action. The database reads the fact itself (the like row, the reply, the accepted
 * friendship, the sent message) and decides who is paid, the limits and the duplicates; this only names what just happened.
 * Never throws: the action already happened, so a payout failure must not fail it. Null when the call failed.
 */
export async function awardSocialEarn(deps: { rpc(name: string, args: Record<string, unknown>): Promise<unknown> }, actor: string, action: SocialEarnAction, sourceId: string): Promise<DukjilActionResult | null> {
  try {
    const parsed = dukjilActionResultSchema.safeParse(await deps.rpc("record_social_earn", { p_actor: actor, p_action: action, p_source: sourceId }));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error("social_earn_failed", action, error instanceof Error ? error.message : "unknown");
    return null;
  }
}
