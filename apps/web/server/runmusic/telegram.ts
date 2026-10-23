import "server-only";
import { z } from "zod";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { decryptRunmusicContact, parseRunmusicContactKey } from "./contact-crypto";

const claimSchema = z.object({ id: z.uuid(), claimToken: z.uuid() }).strict();
const snapshotSchema = z.object({
  appUserId: z.uuid(), email: z.email().max(254), ciphertext: z.string().min(1).max(1024), enteredAt: z.iso.datetime({ offset: true }),
}).strict();
const configSchema = z.object({ token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/), chatId: z.string().regex(/^-\d+$/) });
type Config = z.infer<typeof configSchema>;
type Outcome = { outcome: "sent"; messageId: number } | { outcome: "throttled"; retryAfter: number } | { outcome: "rejected" | "unknown" };
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export async function sendRunmusicTelegram(config: Config, text: string, fetcher: typeof fetch = fetch): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ chat_id: config.chatId, text, link_preview_options: { is_disabled: true } }),
    });
  } catch { return { outcome: "unknown" }; }
  let body: Record<string, unknown> | null = null;
  try { body = record(await response.json()); } catch { /* A malformed success cannot be retried safely. */ }
  if (response.status >= 500 || (body?.ok === true && body.error_code !== undefined)) return { outcome: "unknown" };
  if (response.status === 429 || (body?.ok === false && body.error_code === 429)) {
    const retry = record(body?.parameters)?.retry_after;
    return { outcome: "throttled", retryAfter: typeof retry === "number" && Number.isFinite(retry) ? Math.max(1, Math.min(86_400, Math.trunc(retry))) : 60 };
  }
  if ([400, 401, 403].includes(response.status) || [400, 401, 403].includes(Number(body?.error_code))) return { outcome: "rejected" };
  const messageId = record(body?.result)?.message_id;
  return response.ok && body?.ok === true && Number.isSafeInteger(messageId) && Number(messageId) > 0
    ? { outcome: "sent", messageId: messageId as number } : { outcome: "unknown" };
}

export async function processRunmusicTelegram(
  rpc: FanpageDependencies["rpc"], appUserId: string | null = null,
  env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch,
): Promise<"disabled" | "idle" | "handled"> {
  if (env.RUNMUSIC_TELEGRAM_MODE !== "enabled") return "disabled";
  const config = configSchema.parse({ token: env.RUNMUSIC_TELEGRAM_BOT_TOKEN, chatId: env.RUNMUSIC_TELEGRAM_CHAT_ID });
  const key = parseRunmusicContactKey(env.RUNMUSIC_CONTACT_ENCRYPTION_KEY);
  const raw = await rpc("claim_runmusic_telegram_delivery", { p_app_user_id: appUserId });
  if (raw === null) return "idle";
  const claim = claimSchema.parse(raw);
  const args = { p_delivery_id: claim.id, p_claim_token: claim.claimToken };
  const snapshot = await rpc("begin_runmusic_telegram_delivery", { ...args, p_chat_id: config.chatId });
  if (snapshot === null) return "handled";
  let text: string;
  try {
    const entry = snapshotSchema.parse(snapshot);
    const kakaoId = decryptRunmusicContact(entry.ciphertext, entry.appUserId, key);
    text = `런앤뮤직 응모 완료\n이메일: ${entry.email}\n카카오톡 ID: ${kakaoId}\n응모 시각: ${new Date(entry.enteredAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} (KST)`;
  } catch {
    await rpc("finish_runmusic_telegram_delivery", { ...args, p_outcome: "invalid_contact", p_reason: "invalid_contact" });
    return "handled";
  }
  const result = await sendRunmusicTelegram(config, text, fetcher);
  // A failed finish leaves sending fenced; expiry becomes unknown, never another send.
  await rpc("finish_runmusic_telegram_delivery", {
    ...args, p_outcome: result.outcome,
    p_message_id: result.outcome === "sent" ? result.messageId : null,
    p_retry_after: result.outcome === "throttled" ? result.retryAfter : null,
  });
  return "handled";
}
