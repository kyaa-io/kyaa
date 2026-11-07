// Synthetic: signed-in values are fixtures. ?auth=off signs out, ?missions=0..5 sets today's finished daily missions, ?bias=none has no passport.
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "@/components/locale-provider";
import { FanAppHeader } from "@/components/fan-shell/fan-app-shell";
import { FanPageHeader } from "@/components/fan-ui/fan-page-header";
import { HomeRankingCard } from "@/features/rankings/ui/home-ranking-card";
import { pageHeadCopy } from "@/features/groups/ui/page-head-copy";
import { parseAppLocale } from "@/i18n/locales";
import "@/app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

const params = new URLSearchParams(location.search);
const locale = parseAppLocale(params.get("locale"));
const done = Number(params.get("missions") ?? 3);
const passport = (slug: string, name: string, id: string, tier: string) => ({ celebrity: { slug, name, image: `/images/guest-home/${slug}-card.jpg`, isPublic: true }, relationship: "passport", passport: { id, tier, score: 40, remainingToNextTier: 10 }, ticketBalance: 0, firstReaction: null });
const summary = { profile: { nickname: "합성팬" }, creators: params.get("bias") === "none" ? [] : [passport("elina", "엘리나", "11111111-1111-4111-8111-111111111111", "Gold"), passport("changha", "Changha", "22222222-2222-4222-8222-222222222222", "Silver")],
  live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 2, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 };
const act = (limit: number, finished: boolean) => ({ count: finished ? limit : 0, points: 0, remaining: finished ? 0 : limit, stamped: false });
const today = { kstDate: "2026-11-07", policyActive: true, totalPoints: 22, hasPassport: true, attendance: { attendedToday: done >= 1, streak: 1, nextBonusIn: 6 },
  actions: { post: act(3, done >= 2), share: act(3, done >= 3), comment: act(10, done >= 4), reaction: act(5, done >= 5) } };
const wallet = { sequence: 1, points: 1234, tickets: 3, policyVersion: "group-wallet-v1", pointCost: 100, rewardsStartOn: "2026-11-03", writeFenced: false,
  attendance: { date: "2026-11-07", checkedIn: done >= 1, streak: 1, nextBonusIn: 6, days: [] }, exchangesRemainingToday: 1 };
const real = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input), location.origin);
  if (url.pathname === "/api/me/summary") return Response.json({ summary });
  if (url.pathname === "/api/me/dukjil/today") return Response.json(today);
  if (url.pathname === "/api/me/wallet") return Response.json(wallet);
  // The fixture token is not a real one: rankings are read as signed out (public), so "me" stays empty here.
  if (url.pathname.startsWith("/api/rankings") && params.get("rankings") === "fail") return Response.json({ error: { code: "RANKING_UNAVAILABLE" } }, { status: 503 });
  if (url.pathname.startsWith("/api/rankings") || url.pathname === "/api/dukjil/catalog") return real(url.pathname + url.search);
  if (url.pathname.startsWith("/api/")) return Response.json({ error: { code: "U_A_LOCAL_FIXTURE_ONLY" } }, { status: 503 });
  return real(input, init);
}) as typeof fetch;
const intro = "10/26 start❤️ / Live: 9pm~ random / Korean model / 라이브는 밤 9시 이후 랜덤으로 켜요. 공지는 스토리에 올려요. 팬카페 공지도 함께 확인해 주세요.";
document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(
  <LocaleProvider initialLocale={locale}>
    <FanAppHeader locale={locale} groupsEnabled currentPath="/" />
    <main style={{ display: "grid", gap: 32, maxWidth: 1360, margin: "0 auto", padding: "24px 16px" }}>
      <FanPageHeader image={{ src: "/images/guest-home/elina-card.jpg", slug: "elina", alt: "" }} name="히로로" kind="fan" locale={locale}
        description={params.get("intro") === "none" ? undefined : intro} descriptionLabels={pageHeadCopy(locale)}
        star={{ state: "empty", label: "팬 인증", onClick: () => {} }}
        links={[{ kind: "tiktok", href: "https://www.tiktok.com/@x" }, { kind: "instagram", href: "https://www.instagram.com/x" }]}
        stats={<p style={{ margin: 0, fontSize: 13 }}>합성 접속 줄</p>} />
      <div style={{ maxWidth: 360 }}><HomeRankingCard locale={locale} /></div>
    </main>
  </LocaleProvider>,
);
