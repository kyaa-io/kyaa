import { createRoot } from "react-dom/client";
import homeStyles from "@/components/guest-home.module.css";
import { LiveHeroCarousel } from "@/components/live-hero-carousel";
import { gggiHomeBanner } from "@/features/home/domain/gggi-home-banner";
import { CelebrityFanPage } from "@/components/celebrity-fan-page";
import { LocaleProvider } from "@/components/locale-provider";
import { OutboundLinkTracker } from "@/features/analytics/client/outbound-link-tracker";
import { parsePublishedCelebrity } from "@/server/content/content-domain";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { parseFanPageTab, resolveBoardSection, resolveBoardSource } from "@/features/fanpage/domain/board-navigation";
import draft from "../../../../content/gggi/celebrity.json";
import { installLocalApi } from "./mocks";
import "@/app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

installLocalApi();
const params = new URLSearchParams(location.search);
const locale = parseAppLocale(params.get("locale"));
const payload = draft.payload;
const localized = payload.localizations[toContentLocale(locale)];
const celebrity = parsePublishedCelebrity({
  slug: payload.slug, locale: toContentLocale(locale), ...localized,
  image_url: payload.imageUrl, image_alt: localized.imageAlt, image_position: payload.imagePosition,
  primary_role: payload.primaryRole, website_url: payload.websiteUrl,
  themes: [], social_links: payload.socialLinks.filter(link => link.active).map(({ platform, url }) => ({ platform, url })),
  display_order: payload.displayOrder, fan_count: payload.fanCount,
});
document.documentElement.lang = locale;
const loginReturnTo = new URL(params.get("returnTo")?.startsWith("/gggi") ? params.get("returnTo")! : "/gggi", location.origin);
loginReturnTo.searchParams.set("viewer", "fan");
if (params.get("authIntent")) loginReturnTo.searchParams.set("authIntent", params.get("authIntent")!);
const page = location.pathname === "/" ? <main className={homeStyles.page} style={{maxWidth:1000,margin:"32px auto",padding:16}}><LiveHeroCarousel homeBanners={[gggiHomeBanner(locale)]} locale={locale} /></main> : location.pathname === "/login" ? <main style={{ padding: 32 }}>
  <h1>로컬 참여 계정</h1><p>외부 로그인 없이 로컬 참여 동작을 확인합니다.</p>
  <a href={`${loginReturnTo.pathname}${loginReturnTo.search}${loginReturnTo.hash}`}>로컬 참여자로 계속</a>
</main> : location.pathname === "/gggi" ? <CelebrityFanPage celebrity={celebrity} locale={locale} upcomingLive={null}
  initialTab={parseFanPageTab(params.get("tab"))}
  initialBoardSection={resolveBoardSection(params.get("tab"), params.get("section"))}
  initialBoardSource={resolveBoardSource(params.get("tab"), params.get("source"))} /> : <main style={{ padding: 32 }}><h1>로컬 미리보기 범위 밖의 페이지입니다.</h1><a href="/gggi">GGGI 팬페이지로 돌아가기</a></main>;
createRoot(document.getElementById("root")!).render(<LocaleProvider initialLocale={locale}><OutboundLinkTracker />{page}</LocaleProvider>);
