import { verifyEmailUnsubscribeToken } from "./email-unsubscribe-token";

export type EmailPreference = "live_reminders" | "survey_reminders" | "benefit_notifications" | "reply_notifications" | "official_post_notifications" | "schedule_notifications";
export type EmailUnsubscribeScope = "preference" | "email";

// The preference a mail kind belongs to: the same switch that decides whether the member gets it.
const PREFERENCE_BY_KIND: Record<string, EmailPreference> = {
  live_reserved: "live_reminders",
  live_24h: "live_reminders",
  live_10m: "live_reminders",
  live_changed: "live_reminders",
  live_cancelled: "live_reminders",
  collectible_claim_available: "live_reminders",
  collectible_claim_expiring: "live_reminders",
  survey_reminder: "survey_reminders",
  benefit_available: "benefit_notifications",
  benefit_unlocked: "benefit_notifications",
  benefit_won: "benefit_notifications",
  recipient_information_required: "benefit_notifications",
  fulfillment_meaningful_update: "benefit_notifications",
  runmusic_result: "benefit_notifications",
  content_reply: "reply_notifications",
  official_post: "official_post_notifications",
  schedule_reminder: "schedule_notifications",
  schedule_changed: "schedule_notifications",
  schedule_cancelled: "schedule_notifications",
};

// Switches that also carry notices a member must not miss (win, pick-up, cancel).
const PREFERENCES_WITH_REQUIRED_NOTICES = new Set<EmailPreference>(["live_reminders", "benefit_notifications"]);

export function preferenceForMailKind(templateKey: string): EmailPreference | null {
  return PREFERENCE_BY_KIND[templateKey] ?? null;
}

export function unsubscribeEndsRequiredNotices(scope: EmailUnsubscribeScope, preference: EmailPreference | null): boolean {
  return scope === "email" || (preference !== null && PREFERENCES_WITH_REQUIRED_NOTICES.has(preference));
}

export type EmailUnsubscribeTarget =
  | { state: "ok"; notificationId: string; templateKey: string; preference: EmailPreference | null }
  | { state: "invalid" | "expired" };

export function resolveEmailUnsubscribeTarget(keyHex: string | undefined, token: string | null | undefined, now: Date = new Date()): EmailUnsubscribeTarget {
  if (!keyHex || !token) return { state: "invalid" };
  const verified = verifyEmailUnsubscribeToken(keyHex, token, now);
  if (!verified.ok) return { state: verified.reason };
  return { state: "ok", notificationId: verified.notificationId, templateKey: verified.templateKey, preference: preferenceForMailKind(verified.templateKey) };
}

export interface EmailUnsubscribeRpcClient {
  rpc(name: "apply_email_unsubscribe", args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

export type EmailUnsubscribeOutcome = "done" | "not_found" | "unavailable";

export async function applyEmailUnsubscribe(
  client: EmailUnsubscribeRpcClient,
  target: Extract<EmailUnsubscribeTarget, { state: "ok" }>,
  change: { scope: EmailUnsubscribeScope; enabled: boolean },
): Promise<EmailUnsubscribeOutcome> {
  if (change.scope === "preference" && !target.preference) return "not_found";
  const { error } = await client.rpc("apply_email_unsubscribe", {
    p_notification_id: target.notificationId,
    p_template_key: target.templateKey,
    p_scope: change.scope,
    p_preference: change.scope === "preference" ? target.preference : null,
    p_enabled: change.enabled,
  });
  if (!error) return "done";
  return error.code === "P0002" ? "not_found" : "unavailable";
}
