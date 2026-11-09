// Mounts the real StreamingGuestHome with fixed, already-settled query results (no server, no network).
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "@/components/locale-provider";
import { StreamingGuestHome } from "@/components/guest-home";
import type { HomeQueryResult } from "@/components/home-query-stream";
import { parseAppLocale } from "@/i18n/locales";
import { homeQueryData } from "./fixtures";
import "@/app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

const locale = parseAppLocale(new URLSearchParams(location.search).get("locale"));
const settled = <T,>(value: T): Promise<HomeQueryResult<T>> => Promise.resolve({ status: "fulfilled", value });
const queries = {
  featuredLives: settled(homeQueryData.featuredLives),
  celebrities: settled(homeQueryData.celebrities),
  homeBanners: settled(homeQueryData.homeBanners),
  homeSlots: settled({}),
  homeNotices: settled({ items: [], nextCursor: null }),
  elinaRaffles: settled(homeQueryData.elinaRaffles),
};
window.fetch = (async (input: RequestInfo | URL) => {
  const path = new URL(String(input instanceof Request ? input.url : input), location.origin).pathname;
  if (path.startsWith("/api/")) return Response.json({ error: { code: "SCREEN_BASELINE_FIXTURE_ONLY" } }, { status: 503 });
  return fetch.call(window, input);
}) as typeof fetch;
document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(
  <LocaleProvider initialLocale={locale}>
    <StreamingGuestHome queries={queries} locale={locale} />
  </LocaleProvider>,
);
