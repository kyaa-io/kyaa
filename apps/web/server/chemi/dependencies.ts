import "server-only";
import { chemiEnabled } from "@/features/chemi/domain/availability";
/** First line of every 케미 route: a closed tab answers 404 and nothing else runs. Returns null when the tab is open. */
export function chemiClosedResponse(): Response | null {
  return chemiEnabled() ? null : Response.json({ error: { code: "CHEMI_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
}
export async function chemiStatusRoute() {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  return Response.json({ enabled: true }, { headers: { "cache-control": "private, no-store" } });
}
