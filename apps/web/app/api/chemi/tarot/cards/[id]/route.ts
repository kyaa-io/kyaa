import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { parseAppLocale } from "@/i18n/locales";
import { tarotCardContent } from "@/server/chemi-tarot/cards";

export const dynamic = "force-dynamic";

/** 카드 한 장의 풀이 글. 누구의 카드인지 알려 주는 값이 없으므로 비회원도 읽는다(저장·식별 없음). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  const { id } = await context.params;
  const card = /^\d{1,2}$/.test(id) ? tarotCardContent(Number(id), parseAppLocale(new URL(request.url).searchParams.get("locale") ?? undefined)) : null;
  if (!card) return Response.json({ error: { code: "CHEMI_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
  return Response.json(card, { headers: { "cache-control": "public, max-age=3600" } });
}
