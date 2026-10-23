import { createRoot } from "react-dom/client";
import { KyaaWaveParticipationScreen } from "../../features/connect/kyaa-wave-participation-screen";
import { ByusDayRsvpManager } from "../../components/admin/byus-day-rsvp-manager";
import { LocaleProvider } from "../../components/locale-provider";
import { parseAppLocale } from "../../i18n/locales";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

const params = new URLSearchParams(location.search);
const locale = parseAppLocale(params.get("locale") ?? undefined);
document.documentElement.lang = locale;
const receipt = { id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-10-20T00:00:00.000Z" };
let participation: typeof receipt | null = params.get("scenario") === "already" ? receipt : null;
let posts = 0;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
 const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
 if (url.includes("/api/admin/byus-day-rsvps")) return Response.json({ attendees: [] });
 if (url.includes("/api/admin/kyaa-wave-participants")) return Response.json({ participants: [{ ...receipt, name: "테스트 참여자" }], nextCursor: null });
 if (!url.includes("/api/kyaa-wave/participation")) return nativeFetch(input, init);
 const scenario = params.get("scenario");
 const authFailure = /^(load|submit)-auth-(401|403)$/.exec(scenario ?? "");
 if (authFailure && (authFailure[1] === "submit") === (init?.method === "POST")) return new Response(null, { status: Number(authFailure[2]) });
 if (init?.method === "POST") {
  posts += 1;
  const code = scenario === "duplicate" ? "PARTICIPATION_REVIEW_REQUIRED" : scenario === "invalid" ? "PARTICIPATION_CODE_INVALID" : scenario === "rate" ? "PARTICIPATION_RATE_LIMITED" : scenario === "closed" ? "PARTICIPATION_CLOSED" : scenario === "retry" && posts === 1 ? "PARTICIPATION_UNAVAILABLE" : null;
  if (code) return Response.json({ error: { code } }, { status: code.endsWith("REVIEW_REQUIRED") ? 409 : code.endsWith("RATE_LIMITED") ? 429 : code.endsWith("CLOSED") ? 410 : code.endsWith("UNAVAILABLE") ? 503 : 400 });
  participation = receipt;
 }
 return Response.json({ participation });
};
createRoot(document.getElementById("root")!).render(
 location.pathname === "/kyaa-wave-fanpage" ? <main><h1>Checked-in Wave destination fixture</h1></main> : location.pathname === "/login" ? <main><h1>Existing login handoff fixture</h1><p>{params.get("returnTo")}</p></main> : <LocaleProvider initialLocale={locale}>{params.get("view") === "admin" ? <ByusDayRsvpManager locale={locale === "ko" ? "ko" : "en"} /> : <KyaaWaveParticipationScreen />}</LocaleProvider>
);
