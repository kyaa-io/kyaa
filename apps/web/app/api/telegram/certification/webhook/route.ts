import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadServerEnv } from "@/server/config/env";
import { createClient } from "@/server/data/client";

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const querySchema = z.object({
  callback_query: z.object({
    id: z.string().min(1).max(128),
    from: z.object({ id: positiveId, is_bot: z.literal(false) }),
    message: z.object({
      message_id: positiveId,
      chat: z.object({ id: z.number().int().negative().min(Number.MIN_SAFE_INTEGER) }),
    }),
    data: z.string().regex(/^(approve|reasons|unclear|mismatch|missing):[a-f0-9-]{36}$/),
  }),
});
const actorMap = z.record(z.string().regex(/^[1-9]\d*$/), z.uuid());
const resultSchema = z.object({
  status: z.enum(["pending", "in_review", "changes_requested", "approved", "rejected", "reasons"]),
  photo: z.boolean(),
});
const labels = {
  pending: "관리자 화면에서 처리해 주세요.",
  in_review: "관리자 화면에서 심사 중이에요.",
  changes_requested: "보완을 요청했어요.",
  approved: "승인했어요.",
  rejected: "반려했어요.",
};

export async function POST(request: Request): Promise<Response> {
  const source = process.env;
  const token = source.TELEGRAM_DEV_CERTIFICATION_BOT_TOKEN;
  const chat = source.TELEGRAM_DEV_CERTIFICATION_CHAT_ID;
  const secret = source.TELEGRAM_DEV_CERTIFICATION_WEBHOOK_SECRET;
  if (new URL(request.url).hostname !== "dev.kyaa.io" || source.BYUS_DATA_ENVIRONMENT !== "development"
    || !token || !/^\d+:[\w-]+$/.test(token) || !chat || !/^-[1-9]\d*$/.test(chat)
    || [source.TELEGRAM_BOT_TOKEN, source.TELEGRAM_CS_BOT_TOKEN, source.TELEGRAM_ALERT_BOT_TOKEN].includes(token)
    || [source.TELEGRAM_CHAT_ID, source.TELEGRAM_CS_CHAT_ID].includes(chat)
    || !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return new Response(null, { status: 404 });
  const expected = Buffer.from(secret);
  const incoming = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
    return new Response(null, { status: 403 });
  }

  const parsed = querySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const query = parsed.data.callback_query;
  if (String(query.message.chat.id) !== chat) return new Response(null, { status: 204 });
  async function telegram(method: string, payload: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok === true) return;
    if (method.startsWith("editMessage") && response.status === 400
      && result?.description?.startsWith("Bad Request: message is not modified")) return;
    throw new Error("DEV_TELEGRAM_CERTIFICATION_API_FAILED");
  }

  let actors: z.infer<typeof actorMap>;
  try {
    actors = actorMap.parse(JSON.parse(source.TELEGRAM_DEV_CERTIFICATION_ADMIN_MAP ?? "{}"));
  } catch {
    return new Response(null, { status: 503 });
  }
  const actor = actors[String(query.from.id)];
  const [action, card] = query.data.split(":");
  if (!z.uuid().safeParse(card).success) return new Response(null, { status: 204 });
  const answer = (message?: string) => telegram("answerCallbackQuery", {
    callback_query_id: query.id, text: message, show_alert: Boolean(message),
  }).catch(() => undefined);
  if (!actor) {
    await answer("심사 권한이 없어요.");
    return new Response(null, { status: 204 });
  }

  try {
    const env = loadServerEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.rpc("review_dev_telegram_certification", {
      p_card: card, p_chat: chat, p_message: query.message.message_id,
      p_telegram: query.from.id, p_actor: actor, p_action: action,
    });
    if (error) {
      await answer("처리 상태를 관리자 화면에서 확인해 주세요.");
      return new Response(null, { status: error.code === "P0001" ? 204 : 503 });
    }
    const result = resultSchema.parse(data);
    const target = { chat_id: chat, message_id: query.message.message_id };
    await answer();
    if (result.status === "reasons") {
      await telegram("editMessageReplyMarkup", {
        ...target,
        reply_markup: { inline_keyboard: [
          [{ text: "증빙 확인 어려움", callback_data: `unclear:${card}` }],
          [{ text: "신청과 증빙 불일치", callback_data: `mismatch:${card}` }],
          [{ text: "필수 정보 누락", callback_data: `missing:${card}` }],
          [{ text: "승인", callback_data: `approve:${card}` }],
        ] },
      });
      // A concurrent approval may have completed while the reason menu was being edited.
      const current = await db.rpc("review_dev_telegram_certification", {
        p_card: card, p_chat: chat, p_message: query.message.message_id,
        p_telegram: query.from.id, p_actor: actor, p_action: "reasons",
      });
      if (current.error) throw new Error("DEV_TELEGRAM_CERTIFICATION_STATUS_FAILED");
      result.status = resultSchema.parse(current.data).status;
      if (result.status === "reasons") return new Response(null, { status: 204 });
    }
    await telegram(result.photo ? "editMessageCaption" : "editMessageText", {
      ...target, [result.photo ? "caption" : "text"]: labels[result.status],
      reply_markup: { inline_keyboard: [] },
    });
    return new Response(null, { status: 204 });
  } catch {
    await answer("처리 상태를 관리자 화면에서 확인해 주세요.");
    return new Response(null, { status: 503 });
  }
}
