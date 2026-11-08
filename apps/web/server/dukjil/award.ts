import "server-only";
import { createHash } from "node:crypto";
import { resolveCreatorId } from "./creator-id";
import { dukjilActionResultSchema, type DukjilActionKey, type DukjilActionResult } from "@/features/passport/domain/dukjil-types";

type Rpc = { rpc(name: string, args: Record<string, unknown>): Promise<unknown>; resolveCreatorId?: (slug: string) => Promise<string | null> };

export interface DukjilAwardInput {
  appUserId: string;
  // Null/absent for point-only actions (the database accepts a null creator except for stamped actions: DUKJIL_CELEBRITY_REQUIRED).
  creatorSlug?: string | null;
  actionKey: DukjilActionKey;
  // The id of the thing that earned the reward (post id, comment id, mission id, ...). Reusing the old trigger's source id keeps one action from paying twice (contract §11-B).
  sourceKey: string;
  params?: Record<string, unknown>;
}

// Deterministic request key: the same user, action and source always give the same key, so a retry replays instead of paying again.
export function dukjilRequestKey(appUserId: string, actionKey: string, sourceKey: string): string {
  const hex = createHash("sha256").update(`dukjil:${appUserId}:${actionKey}:${sourceKey}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Codes that only mean "nothing to pay" (no active policy, caps, no passport, short text, wallet not ready, same body or same target again). Expected and silent.
// UNKNOWN_ACTION, DUKJIL_PARAMS_INVALID, DUKJIL_CELEBRITY_REQUIRED, GROUP_WALLET_* are call bugs and are logged.
const SILENT = ["POLICY_INACTIVE", "DUKJIL_DAILY_LIMIT", "PASSPORT_REQUIRED", "SOURCE_REUSED", "DUKJIL_CONTENT_TOO_SHORT", "COMMUNITY_STAMP_WALLET_NOT_READY", "DUKJIL_DUPLICATE_BODY", "DUKJIL_REPEAT_TARGET", "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", "COMMUNITY_STAMP_NOT_FOUND"];

// Calls record_dukjil_action exactly once for one action. It never throws: a payout failure must not fail the action that already happened.
// Returns null when nothing was paid or the call failed.
export async function awardDukjilAction(deps: Rpc, input: DukjilAwardInput, onError?: (error: unknown) => void): Promise<DukjilActionResult | null> {
  return (await awardDukjilActionDetailed(deps, input, onError)).result;
}

/** Why nothing was paid, when the fan can act on it (261107-2 D6): the screen says so instead of leaving the count at 0. */
export type DukjilSkip = "too_short" | "daily_limit" | "same_body" | "passport_required";
const SKIP_REASON: Record<string, DukjilSkip> = { DUKJIL_CONTENT_TOO_SHORT: "too_short", DUKJIL_DAILY_LIMIT: "daily_limit", DUKJIL_DUPLICATE_BODY: "same_body", PASSPORT_REQUIRED: "passport_required" };
export function dukjilSkipReason(message: string): DukjilSkip | undefined {
  const code = Object.keys(SKIP_REASON).find((known) => message.includes(known));
  return code ? SKIP_REASON[code] : undefined;
}

/** `awardDukjilAction` plus the reason a silent refusal carried. Never throws. */
export async function awardDukjilActionDetailed(deps: Rpc, input: DukjilAwardInput, onError?: (error: unknown) => void): Promise<{ result: DukjilActionResult | null; skipped?: DukjilSkip }> {
  let celebrity: string | null = null;
  try {
    if (input.creatorSlug) {
      celebrity = await (deps.resolveCreatorId ?? resolveCreatorId)(input.creatorSlug);
      if (!celebrity) return { result: null };
    }
    const raw = await deps.rpc("record_dukjil_action", {
      p_user: input.appUserId,
      p_celebrity: celebrity,
      p_action_key: input.actionKey,
      p_source_key: input.sourceKey,
      p_request_key: dukjilRequestKey(input.appUserId, input.actionKey, input.sourceKey),
      p_params: input.params ?? {},
    });
    const parsed = dukjilActionResultSchema.safeParse(raw);
    return { result: parsed.success ? parsed.data : null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const skipped = dukjilSkipReason(message);
    if (!SILENT.some((code) => message.includes(code))) {
      (onError ?? ((e) => console.error("dukjil_award_failed", e instanceof Error ? e.message : "unknown")))(error);
      // The server log is not always readable: keep an operator-visible row (and a later retry) in the existing failure table.
      try {
        await deps.rpc("record_dukjil_award_failure", { p_user: input.appUserId, p_celebrity: celebrity, p_action: input.actionKey, p_source: input.sourceKey,
          p_params: input.params ?? {}, p_state: (error as { code?: unknown } | null)?.code ?? null, p_message: message || "unknown" });
      } catch { /* the failure record is best effort */ }
    }
    return skipped ? { result: null, skipped } : { result: null };
  }
}
