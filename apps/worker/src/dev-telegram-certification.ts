import { z } from "zod";
import { createWorkerClient } from "./data-client.js";
import type { NotificationWorkerEnv } from "./notification-env.js";

const cardSchema = z.object({
  id: z.uuid(),
  proof: z.boolean(),
  submittedAt: z.iso.datetime({ offset: true }),
  nickname: z.string(),
  photo: z.string().nullable(),
  assistHint: z.enum(["possible_duplicate", "original_check"]).nullable(),
});
const sentSchema = z.object({ ok: z.literal(true), result: z.object({ message_id: z.number().int().positive() }) });

export async function runDevTelegramCertificationOnce(env: NotificationWorkerEnv): Promise<number> {
  const { devCertificationToken: token, devCertificationChatId: chat } = env.telegram;
  if (env.NOTIFICATION_EXTERNAL_ENVIRONMENT !== "dev" || env.BYUS_DATA_ENVIRONMENT !== "development" || !token || !chat) return 0;
  if (!/^\d+:[\w-]+$/.test(token) || !/^-[1-9]\d*$/.test(chat)
    || [env.telegram.token, env.telegram.csToken, env.telegram.alertToken].includes(token)
    || [env.telegram.chatId, env.telegram.csChatId].includes(chat)) {
    throw new Error("DEV_TELEGRAM_CERTIFICATION_CONFIG_INVALID");
  }
  const db = createWorkerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  });
  const { data, error } = await db.rpc("claim_dev_telegram_certification", { p_chat: chat });
  if (error) throw new Error("DEV_TELEGRAM_CERTIFICATION_CLAIM_FAILED");
  if (data === null) return 0;
  const card = cardSchema.parse(data);
  const date = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
  const path = card.proof ? "proof-review" : "certifications";
  const hint = card.assistHint === "possible_duplicate" ? "\n심사 참고 · 증빙 중복 가능성 확인"
    : card.assistHint === "original_check" ? "\n심사 참고 · 관리자 화면에서 원본 확인" : "";
  const caption = `${card.proof ? "패스포트 스탬프 증빙" : "덕후인증"} 심사 요청 · ${date.format(new Date(card.submittedAt))} (한국 시각) · 신청자 ${card.nickname}${hint}`;
  const keyboard = { inline_keyboard: [
    [{ text: "승인", callback_data: `approve:${card.id}` }, { text: "반려", callback_data: `reasons:${card.id}` }],
    [{ text: "관리자에서 보기", url: `https://dev.kyaa.io/admin/${path}` }],
  ] };
  const body = new FormData();
  body.set("chat_id", chat);
  body.set("reply_markup", JSON.stringify(keyboard));
  const photo = card.photo ? Buffer.from(card.photo, "base64") : null;
  const hasPhoto = Boolean(photo && photo[0] === 0xff && photo[1] === 0xd8);
  if (photo && hasPhoto) {
    body.set("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "redacted.jpg");
    body.set("caption", caption);
  } else {
    body.set("text", `${caption}\n증빙은 관리자 화면에서 확인해 주세요.`);
    body.set("link_preview_options", JSON.stringify({ is_disabled: true }));
  }
  const messageId = await (async () => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${hasPhoto ? "sendPhoto" : "sendMessage"}`, {
        method: "POST", body, signal: AbortSignal.timeout(8000), redirect: "error",
      });
      if (!response.ok) throw new Error();
      return sentSchema.parse(await response.json()).result.message_id;
    } catch {
      // An ambiguous delivery is never retried automatically.
      throw new Error("DEV_TELEGRAM_CERTIFICATION_SEND_FAILED");
    }
  })();
  const saved = await db.from("dev_telegram_certification_cards")
    .update({ message_id: messageId, has_photo: hasPhoto }).eq("id", card.id).eq("chat_id", chat).select("id").single();
  if (saved.error) throw new Error("DEV_TELEGRAM_CERTIFICATION_RECEIPT_FAILED");
  return 1;
}
