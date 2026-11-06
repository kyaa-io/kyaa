import { z } from "zod";
import { socialCopy } from "./copy";
import { reachText } from "./reach-copy";
import type { AppLocale } from "@/i18n/locales";

export const dmStateSchema = z.enum(["self", "blocked", "pending", "incoming", "open", "recipient_off", "friends_only", "not_eligible", "retry_later", "limit", "available"]);
export type DmState = z.infer<typeof dmStateSchema>;
export const reachSchema = z.object({ dmState: dmStateSchema, artist: z.boolean() }).nullable().optional();

type ProfileFacts = {
  isSelf?: boolean;
  capabilities: { canRequestDm: boolean };
  dm: { conversationId: string | null; status: string; canSend: boolean };
  reach?: { dmState: DmState } | null;
};

/** The server's answer. Without it (the migration is not applied, or its read failed) the capabilities give the same buttons with the plain reason. */
export function dmStateOf(profile: ProfileFacts): DmState {
  if (profile.reach) return profile.reach.dmState;
  if (profile.isSelf) return "self";
  if (profile.dm.status === "outgoing_request") return "pending";
  if (profile.dm.status === "incoming_request") return "incoming";
  if (profile.dm.conversationId && profile.dm.status === "accepted" && profile.dm.canSend) return "open";
  return profile.capabilities.canRequestDm ? "available" : "blocked";
}

export const dmEnabled = (state: DmState) => state === "available" || state === "open" || state === "incoming";

/** Text under a disabled button. A block, a sanction and a disabled account all read the same on purpose. */
export function dmReason(locale: AppLocale, state: DmState): string | null {
  switch (state) {
    case "not_eligible": return reachText(locale, "notEligible");
    case "recipient_off": return reachText(locale, "recipientOff");
    case "friends_only": return reachText(locale, "friendsOnly");
    case "limit": return reachText(locale, "limit");
    case "pending": return reachText(locale, "pending");
    case "retry_later": return reachText(locale, "retryLater");
    case "blocked": return socialCopy(locale).cannotSend;
    default: return null;
  }
}
