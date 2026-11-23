import "server-only";
import { chemiEnabled, chemiFeatures } from "@/features/chemi/domain/availability";
/** First line of every 케미 route: a closed tab answers 404 and nothing else runs. Returns null when the tab is open. */
export function chemiClosedResponse(): Response | null {
  return chemiEnabled() ? null : Response.json({ error: { code: "CHEMI_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
}
/** 운영 조합에서 닫은 기능(질문하기·'내일 알려 줘' 신청)의 API 는 탭이 닫힌 것과 같이 404 로 답한다. */
export function chemiFeatureClosedResponse(feature: "ask" | "reminders"): Response | null {
  return chemiClosedResponse() ?? (chemiFeatures()[feature] ? null : Response.json({ error: { code: "CHEMI_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } }));
}
export async function chemiStatusRoute() {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  return Response.json({ enabled: true }, { headers: { "cache-control": "private, no-store" } });
}
