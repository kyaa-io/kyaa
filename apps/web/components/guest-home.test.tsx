import type { HomeBanner } from "@/features/home/domain/home-banner";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
import type { PublishedCelebrity, PublishedCelebrityLive } from "@/server/content/content-domain";
import type { RaffleList } from "@/features/benefit/domain/raffle";
import { settleHomeQuery, type HomeQueries } from "./home-query-stream";
import { APP_LOCALES } from "@/i18n/locales";
import { bannerFixture } from "../e2e/banner-local/fixture";
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatKoreanLiveDate, formatPassportTier, GuestHome, StreamingGuestHome } from "./guest-home";
import { notifyFanActivityUpdated } from "./fan-ui/fan-activity-updates";
import { formatHeroLiveTitle, formatLiveCountdown } from "./live-hero-carousel";

const privy = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  getAccessToken: vi.fn<() => Promise<string | null>>().mockResolvedValue("token"),
  user: { id: "owner-a" },
}));
const routerActions = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const routerRefresh = routerActions.refresh;

vi.mock("./home-community-preview", () => ({ HomeCommunityPreview: () => <div data-testid="home-community-preview" /> }));
// The ranking card (261107-2 U3) has its own tests; here it only holds its place.
vi.mock("@/features/rankings/ui/home-ranking-card", () => ({ HomeRankingCard: ({ headingId }: { headingId?: string }) => <section data-testid="home-ranking" aria-labelledby={headingId} /> }));
vi.mock("@/features/rankings/ui/home-challenges", () => ({ HomeChallenges: () => <section data-testid="home-challenges" /> }));
// The challenge list (B) is a fixed answer; the favorite card's creator ranking (D13) keeps the real hook so its fetch stub answers it.
vi.mock("@/features/rankings/ui/use-ranking-resource", async () => {
  const actual = await vi.importActual<typeof import("@/features/rankings/ui/use-ranking-resource")>("@/features/rankings/ui/use-ranking-resource");
  const challenges = { state: { status: "ready", data: { items: [{ slug: "kara", name: "KARA", imageUrl: null, title: "찐팬 100명", description: "", endsOn: null, count: 40, target: 100 }] } }, retry: () => undefined };
  return { ...actual, useRankingResource: (url: string, parse: (value: unknown) => unknown) => url.startsWith("/api/rankings/creators") ? actual.useRankingResource(url, parse) : challenges };
});

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privy,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: routerActions.push, refresh: routerRefresh }),
}));

const featuredLive = {
  live: {
    id: "819b52d9-62c3-450c-b3dc-78d84d2238c6", slug: "admin-created-live", effectiveStatus: "scheduled" as const,
    startsAt: "2026-07-24T11:00:00.000Z", endsAt: "2026-07-24T12:00:00.000Z", reservationOpensAt: "2026-07-20T00:00:00.000Z", reservationClosesAt: "2026-07-24T11:00:00.000Z",
    title: "관리자가 등록한 LIVE", description: "설명", productContext: "제품", heroImage: { url: "/images/guest-home/kara-hero.png", alt: "관리자 LIVE" },
    celebrity: { slug: "kara", name: "KARA", image: "/images/guest-home/kara-card.jpg", fanCount: 12_800_000 }, brand: { slug: "nualeaf", name: "NUALEAF", logo: "/images/brand.png", websiteUrl: null }, watch: { available: false, provider: "youtube" as const, url: "https://youtube.com/live/abc" },
  },
  viewer: { authenticated: false, passport: "missing" as const, reservation: null }, primaryAction: "sign_in_to_reserve" as const,
};

const celebrities = [
  { slug: "kara", locale: "ko", name: "KARA", summary: "KARA summary", image: { url: "/images/guest-home/kara-card.jpg", alt: "KARA portrait", position: "center" }, roles: ["idol"] as const, themes: [], socialLinks: [{ platform: "youtube", url: "https://youtube.com/@kara" }, { platform: "tiktok", url: "https://tiktok.com/@kara" }, { platform: "instagram", url: "https://instagram.com/kara" }], displayOrder: 0, fanCount: 12_800_000 },
  { slug: "elina", locale: "ko", name: "Elina", summary: "Elina summary", image: { url: "/images/guest-home/elina-card.jpg", alt: "Elina portrait", position: "center" }, roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: 1, fanCount: 3_200_000 },
  { slug: "changha", locale: "ko", name: "Changha", summary: "Changha summary", image: { url: "/images/guest-home/changha-card.jpg", alt: "Changha portrait", position: "center" }, roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: 2, fanCount: 1_450_000 },
] as const;
const elinaRaffles = [{
  id: "6036dfa3-6fe3-4d6f-aa02-93917af4d8de", benefitId: "fff318a6-24c7-4012-8290-3494a55e287c",
  title: "뱅크시 전시 티켓", summary: "엘리나 경품", imageUrl: null, winnerQuantity: 60,
  status: "open" as const, entryOpensAt: null, entryClosesAt: "2026-10-07T09:00:00+00:00",
  fulfillmentMethod: "on_site_pickup" as const, perFanTicketLimit: null,
}];
const defaultProps = { homeBanners: [bannerFixture], celebrities, elinaRaffles, locale: "ko" as const };
const reactionStates = (slugs: readonly string[], reacted: (slug: string) => boolean = () => false) => ({
  states: Object.fromEntries(slugs.map((slug) => [slug, { reacted: reacted(slug) }])),
});

describe("canonical 03 guest home", () => {
  it("links the hero to all events in the current language", () => {
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(screen.getByRole("link", { name: /전체 이벤트/ })).toHaveAttribute("href", "/events?locale=ko");
  });
  it.each(APP_LOCALES.flatMap(locale => [false, true].map(authenticated => ({ locale, authenticated }))))(
    "keeps the home banner before the fan board in $locale (authenticated: $authenticated)",
    ({ locale, authenticated }) => {
      privy.authenticated = authenticated;
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 503 })));
      render(<GuestHome {...defaultProps} featuredLives={[]} locale={locale} />);
      const banner = document.querySelector("[data-managed-home-banner]")!;
      const board = screen.getByTestId("home-community-preview");
      expect(banner.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
  );

  it.each(APP_LOCALES)("shows the approved Kyaa slogan in %s", (locale) => {
    render(<GuestHome {...defaultProps} featuredLives={[]} locale={locale} />);
    expect(screen.getByRole("heading", { level: 1, name: "Kyaa. Every Fan Moment Counts." })).toBeInTheDocument();
    expect(screen.getByText("Every Fan Moment Counts.", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("오늘, 최애를 만나는 시간")).not.toBeInTheDocument();
  });

  afterEach(() => {
    privy.ready = true;
    privy.authenticated = false;
    privy.getAccessToken.mockReset().mockResolvedValue("token");
    privy.user.id = "owner-a";
    routerRefresh.mockReset();
    routerActions.push.mockReset();
    window.history.replaceState({}, "", "/");
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("formats KST deterministically without server locale AM/PM variation", () => {
    expect(formatKoreanLiveDate("2026-07-24T00:05:00.000Z")).toBe("7월 24일 오전 9:05");
    expect(formatKoreanLiveDate("2026-07-24T11:00:00.000Z")).toBe("7월 24일 오후 8:00");
  });

  it("reuses the complete tier labels when Home receives a legacy Passport without stage data", () => {
    expect((["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const).map((tier) =>
      formatPassportTier(tier, "ko"),
    )).toEqual(["브론즈", "실버", "골드", "플래티넘", "다이아몬드"]);
    expect(formatPassportTier("Diamond", "en")).toBe("Diamond");
  });

  it("formats the DESIGN countdown contract with and without a day prefix", () => {
    const startsAt = "2026-09-15T11:00:00.000Z";
    expect(formatLiveCountdown(startsAt, Date.parse("2026-09-13T08:57:56.000Z"))).toBe("D-2");
    expect(formatLiveCountdown(startsAt, Date.parse("2026-09-15T10:57:56.000Z"))).toBe("00:02:04");
    expect(formatLiveCountdown(startsAt, Date.parse(startsAt))).toBe("시작 확인 중");
  });

  it("formats Home Hero titles without repeating the brand", () => {
    expect(["KARA", "Elina", "Changha"].map(formatHeroLiveTitle)).toEqual([
      "KARA LIVE",
      "Elina LIVE",
      "Changha LIVE",
    ]);
  });

  it("refreshes server status once when the LIVE reaches its start in the upcoming list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(featuredLive.live.startsAt) - 500));
    const { unmount } = render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    expect(routerRefresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("시작 확인 중")).toHaveLength(1);
    expect(screen.queryByText("LIVE NOW")).not.toBeInTheDocument();
    unmount();
  });

  it("keeps active LIVE details separate from the regular broadcast banner", () => {
    render(<GuestHome {...defaultProps} featuredLives={[{
      ...featuredLive,
      live: { ...featuredLive.live, effectiveStatus: "live" },
      primaryAction: "watch_live",
    }]} />);
    expect(screen.getByRole("heading", { name: "엘리나의 정기 LIVE" })).toBeInTheDocument();
    expect(screen.queryByText("KARA × NUALEAF")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "관리자가 등록한 LIVE 상세 보기" })).toHaveAttribute(
      "href",
      "/live/admin-created-live?locale=ko",
    );
  });

  it("hydrates the server Home markup without a date text mismatch", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    document.body.append(container);

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <GuestHome {...defaultProps} featuredLives={[featuredLive]} />); });

    expect(container).toHaveTextContent("7월 24일 오후 8:00");
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match|server rendered html/i);
    expect(consoleWarn.mock.calls.flat().join(" ")).not.toMatch(/width or height|aspect.ratio/i);
    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it.each([false, true])("places the ranking card under the hero and before the fan board on 390 (signed in: %s)", (authenticated) => {
    privy.authenticated = authenticated;
    if (authenticated) vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>(() => {})));
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    const slot = document.querySelector('[class*="mobilePersonalization"] [data-testid="home-ranking"]')!;
    const board = screen.getByTestId("home-community-preview");
    expect(slot.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the mobile slot before the fan board while auth is loading, like guests", () => {
    privy.ready = false;
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    const slot = document.querySelector('[class*="mobilePersonalization"]')!;
    const board = screen.getByTestId("home-community-preview");
    expect(slot.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the ranking card in both places instead of the sign-in slot and the passport card (D3)", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    expect(screen.getAllByTestId("home-ranking")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "로그인하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "내 패스포트" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "방송 일정 보기" })).toHaveAttribute("href", "/live/calendar?celebrity=elina&locale=ko");
    expect(screen.getByRole("link", { name: "관리자가 등록한 LIVE 상세 보기" })).toHaveAttribute("href", "/live/admin-created-live?locale=ko");
  });

  it("uses the Elina participation guide as the final LIVE hero slide", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    fireEvent.click(screen.getByRole("button", { name: "2번째 배너 보기" }));
    const hero = screen.getByRole("region", { name: "홈 배너" });
    expect(within(hero).getByRole("heading", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).toBeInTheDocument();
    expect(within(hero).getByText("팬 인증하고 응모권을 받아 원하는 선물에 응모하세요.")).toBeInTheDocument();
    expect(within(hero).getByText("뱅크시 전시 티켓 · 60명 추첨")).toBeInTheDocument();
    expect(within(hero).getByText(/응모 마감/)).toBeInTheDocument();
    expect(within(hero).getByText("2026.10.07 18:00 (KST)")).toHaveAttribute("datetime", "2026-10-07T09:00:00+00:00");
    expect(within(hero).getByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" }))
      .toHaveAttribute("href", "/c/elina/raffles?locale=ko");
  });

  it("does not turn four published occurrences into four home banners", () => {
    const occurrences = Array.from({ length: 4 }, (_, index) => ({ ...featuredLive, live: { ...featuredLive.live,
      id: `event-${index}`, slug: `event-${index}`, startsAt: `2026-09-${14 + index * 5}T11:00:00.000Z`, title: `정기 LIVE ${index + 1}` } }));
    const view = render(<GuestHome {...defaultProps} featuredLives={occurrences} />);
    expect(document.querySelectorAll("[data-managed-home-banner]")).toHaveLength(1);
    const hero = screen.getByRole("region", { name: "홈 배너" });
    expect(hero.querySelectorAll("article")).toHaveLength(2);
    view.rerender(<GuestHome {...defaultProps} homeBanners={[]} featuredLives={occurrences} />);
    expect(document.querySelectorAll("[data-managed-home-banner]")).toHaveLength(0);
    expect(within(hero).getByRole("heading", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "정기 LIVE 1" })).toBeInTheDocument();
  });

  it("preserves the guide and live list when independent banner loading fails", () => {
    render(<GuestHome {...defaultProps} homeBanners={[]} featuredLives={[featuredLive]} contentErrors={{ homeBanners: true }} />);
    expect(within(screen.getByRole("region", { name: "홈 배너" })).getByRole("heading", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "관리자가 등록한 LIVE 상세 보기" })).toBeInTheDocument();
  });

  it.each(["closed", "cancelled"] as const)("does not promote %s raffle dates as open entries", status => {
    render(<GuestHome {...defaultProps} featuredLives={[]} homeBanners={[]} elinaRaffles={[{ ...elinaRaffles[0], status }]} />);
    expect(screen.queryByText(/2026.10.07/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: status === "closed" ? "응모가 끝났어요" : "래플이 취소됐어요" })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "응모 내역 확인" })) {
      expect(link).toHaveAttribute("href", "/my/raffles?locale=ko");
    }
  });

  it("keeps different prize deadlines separate", () => {
    render(<GuestHome {...defaultProps} locale="en" featuredLives={[]} homeBanners={[]} elinaRaffles={[
      elinaRaffles[0], { ...elinaRaffles[0], id: "other", entryClosesAt: "2026-10-09T09:00:00+00:00" },
    ]} />);
    expect(screen.getByText("Entry deadline · View details")).toBeInTheDocument();
    expect(screen.queryByText(/2026.10.07/)).not.toBeInTheDocument();
  });

  it("uses the same product destinations in desktop and mobile navigation", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);

    const primary = screen.getByRole("navigation", { name: "주요 메뉴" });
    const primaryLinks = within(primary).getAllByRole("link");
    expect(primaryLinks).toHaveLength(4);
    expect(within(primary).getByRole("link", { name: "HOME" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(primary).getByRole("link", { name: "커뮤니티" })).toHaveAttribute(
      "href",
      "/community?locale=ko",
    );

    const mobile = screen.getByRole("navigation", { name: "모바일 주요 메뉴" });
    const mobileLinks = within(mobile).getAllByRole("link");
    expect(mobileLinks).toHaveLength(4);
    expect(mobileLinks.map((link) => link.getAttribute("href"))).toEqual(
      primaryLinks.map((link) => link.getAttribute("href")),
    );
    expect(within(mobile).getByRole("link", { name: "홈" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mobile).getByRole("link", { name: "MY" })).toHaveAttribute(
      "href",
      "/my?locale=ko",
    );
  });

  it("offers all supported languages and selects the current language", async () => {
    const { rerender } = render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    const selector = screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" });
    expect(selector).toHaveValue("ko");
    fireEvent.click(selector);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(APP_LOCALES.length);
    expect(within(listbox).getByRole("option", { name: "繁體中文" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Русский" })).toBeInTheDocument();
    fireEvent.keyDown(listbox, { key: "Escape" });
    rerender(<GuestHome celebrities={celebrities} featuredLives={[featuredLive]} locale="en" />);
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
  });

  it("renders the first three active and scheduled LIVE events", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-23T00:00:00Z"));
    const activeLive = {
      ...featuredLive,
      live: {
        ...featuredLive.live,
        effectiveStatus: "live" as const,
      },
      primaryAction: "watch_live" as const,
    };
    const elinaLive = {
      ...featuredLive,
      live: {
        ...featuredLive.live,
        id: "919b52d9-62c3-450c-b3dc-78d84d2238c6",
        slug: "elina-live",
        title: "Elina 예정 LIVE",
        startsAt: "2026-07-25T11:00:00.000Z",
        celebrity: {
          slug: "elina",
          name: "Elina",
          image: "/images/guest-home/elina-card.jpg",
          fanCount: 3_200_000,
        },
      },
    };
    const changhaLive = {
      ...featuredLive,
      live: {
        ...featuredLive.live,
        id: "a19b52d9-62c3-450c-b3dc-78d84d2238c6",
        slug: "changha-live",
        title: "Changha 예정 LIVE",
        startsAt: "2026-07-26T11:00:00.000Z",
        celebrity: {
          slug: "changha",
          name: "Changha",
          image: "/images/guest-home/changha-card.jpg",
          fanCount: 1_450_000,
        },
      },
    };

    render(
      <GuestHome
        {...defaultProps}
        featuredLives={[activeLive, elinaLive, changhaLive]}
      />,
    );

    const upcoming = screen
      .getByRole("heading", { name: "다가오는 LIVE" })
      .closest("section");
    expect(upcoming).not.toBeNull();
    const list = within(upcoming!);
    const rows = list.getAllByRole("article");

    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("KARA")).toBeInTheDocument();
    expect(within(rows[0]).getByText("LIVE 진행중")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Elina 예정 LIVE")).toBeInTheDocument();
    expect(within(rows[1]).getByText("D-2")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Changha 예정 LIVE")).toBeInTheDocument();
    expect(within(rows[2]).getByText("7월 26일 오후 8:00")).toBeInTheDocument();
    expect(
      within(rows[2]).getByRole("link", {
        name: "Changha 예정 LIVE 상세 보기",
      }),
    ).toHaveAttribute("href", "/live/changha-live?locale=ko");
  });

  it("shows only the nearest recurring LIVE per creator on Home", () => {
    const occurrence = (day: number) => ({ ...featuredLive, live: { ...featuredLive.live,
      id: `recurring-${day}`, slug: `recurring-${day}`, title: `정기 LIVE ${day}`,
      liveType: "recurring" as const, startsAt: `2026-10-0${day}T11:00:00.000Z` } });
    render(<GuestHome {...defaultProps} featuredLives={[occurrence(3), occurrence(1), occurrence(2), featuredLive]} />);
    const preview = within(screen.getByRole("heading", { name: "다가오는 LIVE" }).closest("section")!);
    expect(preview.getAllByRole("article")).toHaveLength(2);
    expect(preview.getByText("정기 LIVE 1")).toBeInTheDocument();
    expect(preview.queryByText("정기 LIVE 2")).not.toBeInTheDocument();
    expect(preview.queryByRole("button", { name: "다음 LIVE 목록" })).not.toBeInTheDocument();
  });

  it("paginates the upcoming LIVE preview without hiding the full catalog link", () => {
    const lives = Array.from({ length: 7 }, (_, index) => ({
      ...featuredLive,
      live: {
        ...featuredLive.live,
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        slug: `upcoming-live-${index + 1}`,
        title: `다가오는 LIVE ${index + 1}`,
        startsAt: `2026-10-${String(index + 1).padStart(2, "0")}T11:00:00.000Z`,
      },
    }));

    render(<GuestHome {...defaultProps} featuredLives={lives} />);

    const upcoming = screen.getByRole("heading", { name: "다가오는 LIVE" }).closest("section");
    expect(upcoming).not.toBeNull();
    const preview = within(upcoming!);
    const previous = preview.getByRole("button", { name: "이전 LIVE 목록" });
    const next = preview.getByRole("button", { name: "다음 LIVE 목록" });

    expect(preview.getAllByRole("article")).toHaveLength(3);
    expect(preview.getByText("다가오는 LIVE 1")).toBeInTheDocument();
    expect(preview.getByText("1 / 3")).toBeInTheDocument();
    expect(previous).toBeDisabled();
    expect(preview.getByRole("link", { name: /전체 라이브/ })).toHaveAttribute("href", "/live?locale=ko");

    fireEvent.click(next);
    expect(preview.getByText("다가오는 LIVE 4")).toBeInTheDocument();
    expect(preview.getByText("2 / 3")).toBeInTheDocument();
    expect(previous).not.toBeDisabled();

    fireEvent.click(next);
    expect(preview.getAllByRole("article")).toHaveLength(1);
    expect(preview.getByText("다가오는 LIVE 7")).toBeInTheDocument();
    expect(preview.getByText("3 / 3")).toBeInTheDocument();
    expect(next).toBeDisabled();
  });

  it("renders two regular-weight metadata rows with compact fans, fan detail links, and icon-only social controls", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} celebrityLives={[
      { slug: "kara-live", celebritySlug: "kara", locale: "ko", title: "KARA LIVE", startsAt: "2026-07-24T11:00:00.000Z", effectiveStatus: "live" },
      { slug: "elina-live", celebritySlug: "elina", locale: "ko", title: "Elina LIVE", startsAt: "2026-07-25T11:00:00.000Z", effectiveStatus: "scheduled" },
    ]} />);

    const karaCard = screen.getByRole("heading", { name: "KARA", level: 3 }).closest("article");
    expect(karaCard).not.toBeNull();
    const card = within(karaCard!);
    expect(card.getByRole("link", { name: "KARA YouTube 공식 채널" })).toHaveAttribute("href", "https://youtube.com/@kara");
    expect(card.getByRole("link", { name: "KARA TikTok 공식 채널" })).toHaveAttribute("href", "https://tiktok.com/@kara");
    expect(card.getByRole("link", { name: "KARA Instagram 공식 채널" })).toHaveAttribute("href", "https://instagram.com/kara");
    expect(card.queryByText("YouTube")).not.toBeInTheDocument();
    expect(card.queryByText("TikTok")).not.toBeInTheDocument();
    expect(card.queryByText("Instagram")).not.toBeInTheDocument();
    // D13: the card no longer shows SNS follower totals as "fans"; true fans and hearts come from the creator ranking.
    expect(card.queryByText("팬 1280만")).not.toBeInTheDocument();
    expect(card.getByRole("link", { name: "KARA 팬페이지 보기" })).toHaveAttribute("href", "/kara?locale=ko");
    expect(screen.queryByText("팬 320만")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Elina 팬페이지 보기" })).toHaveAttribute("href", "/elina?locale=ko");
    expect(screen.queryByText("팬 145만")).not.toBeInTheDocument();
    const changhaCard = screen.getByRole("heading", { name: "Changha", level: 3 }).closest("article");
    expect(within(changhaCard!).getByRole("link", { name: "Changha 팬페이지 보기" })).toHaveAttribute("href", "/changha?locale=ko");
  });

  it("uses a published square Preview only inside the matching favorite card", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} celebrityLives={[
      {
        slug: "kara-live",
        celebritySlug: "kara",
        locale: "ko",
        title: "KARA LIVE",
        startsAt: "2026-07-24T11:00:00.000Z",
        effectiveStatus: "scheduled",
        preview: {
          kind: "artist_teaser",
          durationMs: 4_000,
          square: {
            videoUrl: "https://assets.example/kara-square.mp4",
            posterUrl: "https://assets.example/kara-square.webp",
          },
        },
      },
    ]} />);

    const videos = screen.getAllByTestId("active-preview-video");
    expect(videos).toHaveLength(1);
    expect(videos[0]).toHaveAttribute(
      "poster",
      "https://assets.example/kara-square.webp",
    );
    expect(videos[0]).toHaveAttribute(
      "src",
      "https://assets.example/kara-square.mp4",
    );
    expect(screen.getByRole("img", { name: "Elina portrait" })).toHaveAttribute("sizes", "(max-width: 767px) min(82vw, 288px), 240px");
  });

  it("keeps the desktop context panel available without a toggle and preserves mobile actions", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);

    expect(screen.getByRole("complementary", { name: "랭킹" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /팬 활동/ })).not.toBeInTheDocument();
    const guideCards = screen.getAllByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" });
    const fanmeetingCards = screen.getAllByRole("link", { name: "미국 팬미팅, kyaa와 함께 준비하세요" });
    expect(guideCards).toHaveLength(2);
    expect(fanmeetingCards).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /이퓨.*100일/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다음 가이드" })).not.toBeInTheDocument();
    for (const card of guideCards) expect(card).toHaveAttribute("href", "/c/elina/raffles?locale=ko");
    for (const card of fanmeetingCards) expect(card).toHaveAttribute("href", "/pages/us-fanmeetings?locale=ko");
  });

  it("renders a truthful empty state without inventing a Live link", () => {
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(screen.getByText("현재 공개된 LIVE가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /라이브 예약하기/ })).not.toBeInTheDocument();

  });

  it("uses the effective state to avoid presenting an ended Live as reservable", () => {
    render(<GuestHome {...defaultProps} featuredLives={[{
      ...featuredLive,
      live: { ...featuredLive.live, effectiveStatus: "ended" },
      primaryAction: "live_ended",
    }]} />);
    expect(screen.queryByRole("link", { name: /라이브 예약하기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "관리자가 등록한 LIVE 상세 보기" })).toHaveAttribute("href", "/live/admin-created-live?locale=ko");
  });

  it("renders English CMS content and preserves locale through public and auth links", () => {
    const englishCelebrities = celebrities.map((celebrity) => ({ ...celebrity, locale: "en" as const, name: celebrity.slug === "kara" ? "KARA EN" : celebrity.name }));
    render(<GuestHome celebrities={englishCelebrities} featuredLives={[featuredLive]} locale="en" />);
    expect(screen.getByRole("heading", { name: "Your favorites" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "KARA EN" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View KARA EN details" })).toHaveAttribute("href", "/kara?locale=en");
    expect(screen.getByRole("link", { name: "View 관리자가 등록한 LIVE details" })).toHaveAttribute("href", expect.stringContaining("locale=en"));
  });

  it("preserves the English active LIVE detail link in the upcoming list", () => {
    render(<GuestHome {...defaultProps} locale="en" featuredLives={[{
      ...featuredLive,
      live: { ...featuredLive.live, effectiveStatus: "live" },
      primaryAction: "watch_live",
    }]} />);
    expect(screen.getByRole("link", { name: "View 관리자가 등록한 LIVE details" })).toHaveAttribute(
      "href",
      "/live/admin-created-live?locale=en",
    );
  });

  it("auto-advances every six seconds and supports clean previous, next, and indicator controls", () => {
    vi.useFakeTimers();
    // jsdom never finishes loading pictures; the carousel waits for the next slide's picture in a browser.
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const secondLive = {
      ...featuredLive,
      live: {
        ...featuredLive.live,
        id: "919b52d9-62c3-450c-b3dc-78d84d2238c6",
        slug: "elina-live",
        title: "Elina 예정 LIVE",
        celebrity: { ...featuredLive.live.celebrity, slug: "elina", name: "Elina" },
      },
    };
    render(<GuestHome {...defaultProps} homeBanners={[bannerFixture, { ...bannerFixture, id: "second", title: "다음 정기 방송" }]} featuredLives={[featuredLive, secondLive]} />);

    expect(screen.getByRole("heading", { name: "엘리나의 정기 LIVE", level: 2 })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole("heading", { name: "다음 정기 방송", level: 2 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이전 배너" }));
    expect(screen.getByRole("heading", { name: "엘리나의 정기 LIVE", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1번째 배너 보기" })).toHaveAttribute("aria-current", "true");
    expect(within(screen.getByRole("region", { name: "홈 배너" })).getByRole("button", { name: "자동 재생 정지" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("pauses automatic playback during hover and disables it for reduced motion", () => {
    vi.useFakeTimers();
    const secondLive = {
      ...featuredLive,
      live: { ...featuredLive.live, id: "919b52d9-62c3-450c-b3dc-78d84d2238c6", slug: "elina-live", title: "Elina 예정 LIVE" },
    };
    const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
    }));
    render(<GuestHome {...defaultProps} homeBanners={[bannerFixture, { ...bannerFixture, id: "second", title: "다음 정기 방송" }]} featuredLives={[featuredLive, secondLive]} />);

    const carousel = screen.getByRole("region", { name: "홈 배너" });
    expect(carousel).toHaveAttribute("data-reduced-motion", "true");
    fireEvent.mouseEnter(carousel);
    act(() => vi.advanceTimersByTime(12_000));
    fireEvent.mouseLeave(carousel);
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole("heading", { name: "엘리나의 정기 LIVE", level: 2 })).toBeInTheDocument();
  });

  it("does not flash guest actions while authentication is still loading", () => {
    privy.ready = false;
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);

    expect(screen.queryByRole("link", { name: "로그인하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /이퓨.*100일/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "미국 팬미팅, kyaa와 함께 준비하세요" })).toHaveLength(2);
  });

  it("ignores a late summary from the previous owner", async () => {
    privy.authenticated = true;
    const empty = { profile: { nickname: null }, creators: [], live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 0, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 };
    let resolveOld!: (response: Response) => void;
    const oldSummary = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(oldSummary).mockResolvedValue(Response.json({ summary: empty }));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<GuestHome {...defaultProps} featuredLives={[]} />);
    await act(async () => {});
    privy.user.id = "owner-b";
    view.rerender(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 팬페이지 보기" })).not.toHaveAttribute("data-verified");
    await act(async () => { resolveOld(Response.json({ summary: { ...empty, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg", isPublic: true }, relationship: "passport", passport: { id: "11111111-1111-4111-8111-111111111111", tier: "Gold", score: 50, remainingToNextTier: 70 }, ticketBalance: 0, firstReaction: null }] } })); });
    expect(screen.getByRole("link", { name: "KARA 팬페이지 보기" })).not.toHaveAttribute("data-verified");
  });

  it("does not mark reaction-only creators complete and removes role text only inside cards", async () => {
    privy.authenticated = true;
    const summary = { profile: { nickname: null }, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg", isPublic: true }, relationship: "first_reaction_only", passport: null, ticketBalance: 0, firstReaction: { completedAt: "2026-09-01T00:00:00Z", txHash: null } }], live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 0, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ summary })));
    const { container } = render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 팬페이지 보기" })).not.toHaveAttribute("data-verified");
    expect(screen.getByRole("link", { name: "KARA 팬페이지 보기" })).not.toHaveAttribute("data-verified");
    for (const card of container.querySelectorAll("#home-creator-rail article")) expect(card.textContent).not.toMatch(/크리에이터|아이돌/);
    const filters = screen.getByRole("group", { name: "분류로 찾기" });
    expect(within(filters).getByRole("button", { name: "아이돌" })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: "크리에이터" })).toBeInTheDocument();
  });

  it("does not fetch private Home state until an authenticated owner id is known", async () => {
    privy.authenticated = true;
    privy.user.id = "";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    await act(async () => {});
    // Public reads (banner slots, the all-time creator ranking) may go out; nothing private does.
    expect(fetcher.mock.calls.map(([input]) => String(input)).filter(url => !url.startsWith("/api/public/") && !url.startsWith("/api/rankings/creators"))).toEqual([]);
  });

  it("shows retry UI for failed LIVE data without presenting it as an empty LIVE list", () => {
    render(<GuestHome {...defaultProps} featuredLives={[]} contentErrors={{ featuredLives: true }} />);
    expect(screen.queryByText("현재 공개된 LIVE가 없습니다.")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "다시 시도" });
    fireEvent.click(buttons[0]);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });
});

it("uses identical cards for all creators with editorial ordering only", () => {
  const base = defaultProps.celebrities[0];
  const roster = ["elina", "changha", "yuna", "aryeom", "park-myung-ho", "ifewknow", "jung-jenny", "xin"].map((slug, index) => ({ ...base, slug, name: slug, displayOrder:index, fanCount:index * 100 }));
  const { container } = render(<GuestHome celebrities={roster} featuredLives={[]} locale="ko" />);
  expect(screen.queryByRole("heading", { name:"함께 만날 크리에이터" })).not.toBeInTheDocument();
  const section = container.querySelector("#celebrities")!;
  expect(section.querySelectorAll("article")).toHaveLength(8);
  expect([...section.querySelectorAll("article h3")].slice(0,3).map(h => h.textContent)).toEqual(["changha", "elina", "yuna"]);
  expect(new Set([...section.querySelectorAll("article")].map(a => a.className)).size).toBe(1);
  for (const slug of roster.slice(3).map(c => c.slug)) {
    expect(section.querySelector(`a[href="/${slug}?locale=ko"]`)).not.toBeNull();
  }
  expect(section.textContent).not.toMatch(/인기순|팔로워순|순위/);
});

it("renders the verified CHZZK channel with its icon and keeps Instagram", () => {
 const socialLinks = [{platform:"instagram" as const,url:"https://www.instagram.com/jen2jen2_/"},{platform:"chzzk" as const,url:"https://chzzk.naver.com/0a3f97086cb81d3360c69fdf5d020045"}];
 render(<GuestHome {...defaultProps} featuredLives={[]} celebrities={[{...defaultProps.celebrities[0]!,slug:"jenny-jeong",name:"정제니",socialLinks}]} />);
 const link=screen.getByRole("link",{name:"정제니 치지직 공식 채널"});
 expect(link).toHaveAttribute("href",socialLinks[1]!.url);
 expect(link).toHaveAttribute("target","_blank");
 expect(link.querySelector("img")?.getAttribute("src")).toContain("chzzk.png");
 expect(screen.getByRole("link",{name:"정제니 Instagram 공식 채널"})).toBeInTheDocument();
 expect(screen.queryByRole("link",{name:/정제니 TikTok/})).not.toBeInTheDocument();
});

it("filters any assigned role and carries it into the directory without exposing empty roles", () => {
  const { container } = render(<GuestHome {...defaultProps} featuredLives={[]} />);
  const filters = screen.getByRole("group", { name: "분류로 찾기" });
  expect(within(filters).queryByRole("button", { name: "쇼호스트" })).not.toBeInTheDocument();
  fireEvent.click(within(filters).getByRole("button", { name: "크리에이터" }));
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(2);
  expect(within(container.querySelector("#celebrities") as HTMLElement).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/celebrities?locale=ko&role=creator");
  expect(within(filters).getByRole("button", { name: "크리에이터" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(within(filters).getByRole("button", { name: "아이돌" }));
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(1);
  expect(container.querySelectorAll("[data-creator-roles]")).toHaveLength(0);
});

describe("Home favorites filter", () => {
afterEach(() => {
  privy.ready = true;
  privy.authenticated = false;
  privy.getAccessToken.mockReset().mockResolvedValue("token");
  privy.user.id = "owner-a";
  routerActions.push.mockReset();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

function favoriteSummary() {
  return {
    profile: { nickname: "Fan" },
    creators: [
      { celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg", isPublic: true }, relationship: "passport", passport: { id: "11111111-1111-4111-8111-111111111111", tier: "Bronze", score: 1, remainingToNextTier: 14 }, ticketBalance: 1, firstReaction: null },
      { celebrity: { slug: "elina", name: "Elina", image: "/elina.jpg", isPublic: true }, relationship: "first_reaction_only", passport: null, ticketBalance: 0, firstReaction: { completedAt: "2026-09-03T10:00:00.000Z", txHash: null } },
    ],
    live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] },
    collection: { passportCount: 1, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0,
  };
}

/** Public reads every Home render may make (banner slots, all-time creator ranking for the favorite cards). They never take the private answer. */
function publicRead(input: string | URL | Request) {
  const url = String(input);
  if (url.startsWith("/api/public/banner-slots")) return Response.json({ slots: {} });
  if (url.startsWith("/api/rankings/creators")) return Response.json({ period: "all", periodStart: "1970-01-01", computedAt: null, rows: [] });
  return null;
}
const privateCalls = (fetcher: { mock: { calls: unknown[][] } }) => fetcher.mock.calls.map(([input]) => String(input)).filter(url => !url.startsWith("/api/public/") && !url.startsWith("/api/rankings/creators"));

it.each(["owned", "empty", "error", "guest"] as const)("hides intermediate filters until auth and personalization resolve: %s", async (mode) => {
  privy.ready = false;
  privy.authenticated = mode !== "guest";
  let resolveSummary!: (response: Response) => void;
  const pendingSummary = new Promise<Response>(resolve => { resolveSummary = resolve; });
  const fetcher = vi.fn(async (input: string | URL | Request) => publicRead(input) ?? (String(input).startsWith("/api/passports/")
    ? Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } }) : pendingSummary));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<GuestHome {...defaultProps} featuredLives={[]} />);
  const expectSkeleton = () => {
    const section = screen.getByRole("region", { name: "당신의 최애" });
    expect(within(section).getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(within(section).queryByRole("group", { name: "분류로 찾기" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("article")).not.toBeInTheDocument();
    expect(within(section).queryByRole("link")).not.toBeInTheDocument();
  };
  expectSkeleton();
  expect(privateCalls(fetcher)).toEqual([]);
  privy.ready = true;
  view.rerender(<GuestHome {...defaultProps} featuredLives={[]} />);
  if (mode !== "guest") {
    await waitFor(() => expect(privateCalls(fetcher)).not.toEqual([]));
    expectSkeleton();
    const summary = favoriteSummary();
    if (mode === "empty") { summary.creators = []; summary.collection.passportCount = 0; }
    await act(async () => resolveSummary(mode === "error" ? Response.json({}, { status: 500 }) : Response.json({ summary })));
  }
  const section = screen.getByRole("region", { name: "당신의 최애" });
  expect(within(section).queryByRole("status")).not.toBeInTheDocument();
  expect(within(section).getByRole("button", { name: mode === "owned" ? "내 최애" : "전체" })).toHaveAttribute("aria-pressed", "true");
  expect(within(section).getAllByRole("article")).toHaveLength(mode === "owned" ? 1 : 3);
});

it("keeps the chosen filter and cards visible during background personalization refresh", async () => {
  privy.authenticated = true;
  let resolveSummary!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { resolveSummary = resolve; });
  let summaryReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const shared = publicRead(input); if (shared) return shared;
    if (String(input).startsWith("/api/passports/")) return Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } });
    summaryReads += 1;
    return summaryReads === 1 ? Response.json({ summary: favoriteSummary() }) : pending;
  }));
  render(<GuestHome {...defaultProps} featuredLives={[]} />);
  const section = screen.getByRole("region", { name: "당신의 최애" });
  fireEvent.click(await within(section).findByRole("button", { name: "전체" }));
  fireEvent.focus(window);
  await waitFor(() => expect(summaryReads).toBe(2));
  expect(within(section).queryByRole("status")).not.toBeInTheDocument();
  expect(within(section).getAllByRole("article")).toHaveLength(3);
  await act(async () => resolveSummary(Response.json({ summary: favoriteSummary() })));
  expect(within(section).getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
});

it("tags a creator whose 찐팬 100 challenge is on, and no other", () => {
  render(<GuestHome {...defaultProps} featuredLives={[]} initialOwnedOnly={false} />);
  const rail = document.getElementById("home-creator-rail") as HTMLElement;
  const kara = within(rail).getByRole("heading", { name: "KARA" }).closest("article") as HTMLElement;
  expect(within(kara).getByText("찐팬 100 도전 중")).toBeInTheDocument();
  expect(within(rail).getAllByText("찐팬 100 도전 중")).toHaveLength(1);
});

it("places My favorites first and sends guests to login with a restorable Home filter", () => {
  render(<GuestHome {...defaultProps} featuredLives={[]} />);
  const filters = screen.getByRole("group", { name: "분류로 찾기" });
  expect(within(filters).getAllByRole("button").slice(0, 2).map((button) => button.textContent)).toEqual(["내 최애", "전체"]);
  fireEvent.click(within(filters).getByRole("button", { name: "내 최애" }));
  const login = new URL(routerActions.push.mock.calls[0]![0], "https://byus.test");
  expect(login.pathname).toBe("/login");
  expect(login.searchParams.get("returnTo")).toBe("/?locale=ko&owned=1");
});

it("defaults to My favorites after loading and excludes first-reaction-only creators", async () => {
  privy.authenticated = true;
  const summary = favoriteSummary();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const shared = publicRead(input); if (shared) return shared;
    if (url.startsWith("/api/me/creator-reactions")) return Response.json(reactionStates(celebrities.map(({ slug }) => slug)));
    if (url.startsWith("/api/passports/")) return Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } });
    return Response.json({ summary });
  }));
  const { container } = render(<GuestHome {...defaultProps} featuredLives={[]} />);
  const filters = await screen.findByRole("group", { name: "분류로 찾기" });
  await waitFor(() => expect(within(filters).getByRole("button", { name: "내 최애" })).toHaveAttribute("aria-pressed", "true"));
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(1);
  fireEvent.click(within(filters).getByRole("button", { name: "내 최애" }));
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(1);
  expect(within(container.querySelector("#celebrities") as HTMLElement).getByRole("heading", { name: "KARA" })).toBeInTheDocument();
  expect(within(container.querySelector("#celebrities") as HTMLElement).queryByRole("heading", { name: "Elina" })).not.toBeInTheDocument();
  expect(within(container.querySelector("#celebrities") as HTMLElement).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/celebrities?locale=ko&owned=1");
  expect(new URL(window.location.href).searchParams.get("owned")).toBe("1");
  expect(new URL(window.location.href).searchParams.get("role")).toBeNull();
});

it.each(["none", "explicit-all", "role"] as const)("keeps the appropriate default for %s", async (mode) => {
  privy.authenticated = true;
  const summary = favoriteSummary();
  if (mode === "none") {
    summary.creators = [];
    summary.collection.passportCount = 0;
  }
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const shared = publicRead(input); if (shared) return shared;
    if (url.startsWith("/api/me/creator-reactions")) return Response.json(reactionStates(celebrities.map(({ slug }) => slug)));
    if (url.startsWith("/api/passports/")) return Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } });
    return Response.json({ summary });
  }));
  const { container } = render(<GuestHome {...defaultProps} featuredLives={[]}
    initialOwnedOnly={mode === "explicit-all" ? false : undefined} initialRole={mode === "role" ? "creator" : "all"} />);
  const filters = await screen.findByRole("group", { name: "분류로 찾기" });
  await waitFor(() => expect(within(filters).getByRole("button", { name: "내 최애" })).toBeEnabled());
  expect(within(filters).getByRole("button", { name: mode === "role" ? "크리에이터" : "전체" })).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(mode === "role" ? 2 : 3);
});

it("preserves an explicit All choice once personal data resolves", async () => {
  privy.authenticated = true;
  let resolveSummary!: (response: Response) => void;
  const pendingSummary = new Promise<Response>((resolve) => { resolveSummary = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const shared = publicRead(input); if (shared) return shared;
    if (url.startsWith("/api/me/creator-reactions")) return Response.json(reactionStates(celebrities.map(({ slug }) => slug)));
    if (url.startsWith("/api/passports/")) return Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } });
    return pendingSummary;
  }));
  const { container } = render(<GuestHome {...defaultProps} featuredLives={[]} initialOwnedOnly={false} />);
  expect(screen.queryByRole("group", { name: "분류로 찾기" })).not.toBeInTheDocument();
  await act(async () => { resolveSummary(Response.json({ summary: favoriteSummary() })); });
  const filters = await screen.findByRole("group", { name: "분류로 찾기" });
  await waitFor(() => expect(within(filters).getByRole("button", { name: "내 최애" })).toBeEnabled());
  expect(within(filters).getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
  fireEvent.click(within(filters).getByRole("button", { name: "내 최애" }));
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(1);
  fireEvent.click(within(filters).getByRole("button", { name: "전체" }));
  expect(container.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
});

it("shows honest loading and error states for a personal Home deep link", async () => {
  privy.authenticated = true;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  const loading = render(<GuestHome {...defaultProps} featuredLives={[]} initialOwnedOnly />);
  const loadingSection = loading.container.querySelector("#celebrities") as HTMLElement;
  expect(within(loadingSection).getByText("보유한 팬 패스포트를 확인하고 있어요.")).toBeInTheDocument();
  expect(loadingSection.querySelectorAll("article")).toHaveLength(0);
  loading.unmount();

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
  const failed = render(<GuestHome {...defaultProps} featuredLives={[]} initialOwnedOnly />);
  const failedSection = failed.container.querySelector("#celebrities") as HTMLElement;
  expect(await within(failedSection).findByRole("alert")).toHaveTextContent("보유한 팬 패스포트를 확인하지 못했어요.");
  expect(within(failedSection).queryByText("아직 보유한 팬 패스포트가 없어요.")).not.toBeInTheDocument();
  expect(failedSection.querySelectorAll("article")).toHaveLength(0);
});

it.each([0, 1])("offers the full roster when no owned profile is published and Passport count is %s", async (passportCount) => {
  privy.authenticated = true;
  const summary = {
    profile: { nickname: null }, creators: [], live: { upcoming: [], history: [] },
    rewards: { availableCount: 0, entries: 0, items: [] },
    collection: { passportCount, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0,
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).startsWith("/api/me/creator-reactions")
    ? Response.json(reactionStates(celebrities.map(({ slug }) => slug)))
    : Response.json({ summary })));
  const { container } = render(<GuestHome {...defaultProps} featuredLives={[]} initialOwnedOnly />);
  const section = container.querySelector("#celebrities") as HTMLElement;
  expect(await within(section).findByText(passportCount > 0 ? "지금 공개된 내 최애가 없어요." : "아직 보유한 팬 패스포트가 없어요.")).toBeInTheDocument();
  fireEvent.click(within(section).getByRole("button", { name: "전체 보기" }));
  expect(section.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
  expect(new URL(window.location.href).searchParams.get("owned")).toBeNull();
});
});
vi.mock("@/features/live/ui/observed-live-strip", () => ({ ObservedLiveStrip: () => null }));

describe("streamed Home sections", () => {
  afterEach(() => {
    privy.authenticated = false;
    privy.ready = true;
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: () => void;
    const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = () => fail(new Error("unavailable")); });
    return { promise, resolve, reject };
  }

  function pendingHome() {
    const pending = {
      homeBanners: deferred<readonly HomeBanner[]>(),
      celebrities: deferred<readonly PublishedCelebrity[]>(),
      celebrityLives: deferred<readonly PublishedCelebrityLive[]>(),
      featuredLives: deferred<readonly LiveEventResponse[]>(),
      elinaRaffles: deferred<RaffleList>(),
    };
    const queries: HomeQueries = {
      homeBanners: settleHomeQuery(pending.homeBanners.promise),
      celebrities: settleHomeQuery(pending.celebrities.promise),
      celebrityLives: settleHomeQuery(pending.celebrityLives.promise),
      featuredLives: settleHomeQuery(pending.featuredLives.promise),
      elinaRaffles: settleHomeQuery(pending.elinaRaffles.promise),
    };
    const publishedCreatorSlugs = queries.celebrities.then(result => result.status === "fulfilled" ? result.value.map(item => item.slug) : null);
    return { pending, queries, publishedCreatorSlugs };
  }

  it("shows the real GGGI banner immediately and releases each section without waiting for optional queries", async () => {
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome {...home} locale="ko" />); });
    expect(view.container.querySelector("[data-managed-home-banner]")).toHaveTextContent("GGGI");
    expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).not.toBeInTheDocument();
    await act(async () => { home.pending.celebrities.resolve(celebrities); });
    const filters = await screen.findByRole("group", { name: "분류로 찾기" });
    expect(view.container.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
    await act(async () => { fireEvent.click(within(filters).getByRole("button", { name: "크리에이터" })); });
    await act(async () => { home.pending.celebrityLives.resolve([]); home.pending.featuredLives.resolve([featuredLive]); });
    expect(within(filters).getByRole("button", { name: "크리에이터" })).toHaveAttribute("aria-pressed", "true");
    expect(view.container.querySelectorAll("#home-creator-rail article")).toHaveLength(2);
    expect(await screen.findByText(featuredLive.live.title)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).not.toBeInTheDocument();
    await act(async () => { home.pending.homeBanners.resolve([bannerFixture]); home.pending.elinaRaffles.resolve({ raffles: elinaRaffles }); });
    expect(screen.getAllByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" }).length).toBeGreaterThan(0);
    expect(within(filters).getByRole("button", { name: "크리에이터" })).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves the owner, filters, LIVE page and carousel while optional data settles", async () => {
    privy.authenticated = true;
    const summary = {
      profile: { nickname: "Fan" },
      creators: ["kara", "elina"].map((slug, index) => ({
        celebrity: { slug, name: slug === "kara" ? "KARA" : "Elina", image: `/${slug}.jpg`, isPublic: true },
        relationship: "passport", passport: { id: index ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", tier: "Bronze", score: 1, remainingToNextTier: 14 }, ticketBalance: 0, firstReaction: null,
      })),
      live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] },
      collection: { passportCount: 2, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0,
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).startsWith("/api/passports/")
      ? Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } }) : Response.json({ summary }));
    vi.stubGlobal("fetch", fetcher);
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome {...home} locale="ko" />); });
    expect(screen.queryByText("아직 보유한 팬 패스포트가 없어요.")).not.toBeInTheDocument();
    await act(async () => {
      home.pending.celebrities.resolve(celebrities);
      home.pending.homeBanners.resolve([]);
      home.pending.featuredLives.resolve(Array.from({ length: 4 }, (_, index) => ({ ...featuredLive, live: { ...featuredLive.live, id: `live-${index}`, slug: `live-${index}`, title: `LIVE ${index}` } })));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "크리에이터" })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "크리에이터" }));
      fireEvent.click(screen.getByRole("button", { name: "다음 LIVE 목록" }));
      fireEvent.click(screen.getByRole("button", { name: "다음 배너" }));
    });
    const activeSlide = view.container.querySelector('[aria-roledescription="slide"][data-active="true"]');
    await act(async () => {
      home.pending.celebrityLives.reject();
      home.pending.elinaRaffles.resolve({ raffles: elinaRaffles.map(raffle => ({ ...raffle, status: "closed" })) });
    });
    expect(screen.getByRole("button", { name: "크리에이터" })).toHaveAttribute("aria-pressed", "true");
    expect(within(view.container.querySelector("#upcoming") as HTMLElement).getByText("2 / 2")).toBeInTheDocument();
    expect(view.container.querySelector('[aria-roledescription="slide"][data-active="true"]')).toBe(activeSlide);
    expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith("/api/me/summary"))).toHaveLength(1);
  });

  it("keeps unlisted pages out of the discovery chips and in My favorites", async () => {
    privy.authenticated = true;
    const summary = {
      profile: { nickname: "Fan" },
      creators: ["kara", "elina"].map((slug, index) => ({
        celebrity: { slug, name: slug === "kara" ? "KARA" : "Elina", image: `/${slug}.jpg`, isPublic: true },
        relationship: "passport", passport: { id: index ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", tier: "Bronze", score: 1, remainingToNextTier: 14 }, ticketBalance: 0, firstReaction: null,
      })),
      live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] },
      collection: { passportCount: 2, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).startsWith("/api/passports/")
      ? Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } }) : Response.json({ summary })));
    const home = pendingHome();
    const queries: HomeQueries = { ...home.queries, unlistedCreators: Promise.resolve({ status: "fulfilled", value: ["kara", "changha"] }) };
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome queries={queries} publishedCreatorSlugs={home.publishedCreatorSlugs} locale="ko" />); });
    await act(async () => { home.pending.celebrities.resolve(celebrities); });
    const filters = await screen.findByRole("group", { name: "분류로 찾기" });
    const rail = () => [...view.container.querySelectorAll("#home-creator-rail article h3")].map(heading => heading.textContent);
    await act(async () => { fireEvent.click(within(filters).getByRole("button", { name: "전체" })); });
    expect(rail()).toEqual(["Elina"]);
    await act(async () => { fireEvent.click(within(filters).getByRole("button", { name: "내 최애" })); });
    await waitFor(() => expect([...rail()].sort()).toEqual(["Elina", "KARA"]));
    // The only idol is unlisted, so no idol chip offers an empty rail.
    expect(within(filters).queryByRole("button", { name: "아이돌" })).not.toBeInTheDocument();
  });

  it("shows every creator when the unlisted list fails", async () => {
    const home = pendingHome();
    const queries: HomeQueries = { ...home.queries, unlistedCreators: Promise.resolve({ status: "rejected" }) };
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome queries={queries} publishedCreatorSlugs={home.publishedCreatorSlugs} locale="ko" />); });
    await act(async () => { home.pending.celebrities.resolve(celebrities); });
    await screen.findByRole("group", { name: "분류로 찾기" });
    expect(view.container.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
  });

  it.each(["homeBanners", "celebrities", "featuredLives", "celebrityLives", "elinaRaffles"] as const)("isolates a failed %s query", async (failed) => {
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome {...home} locale="ko" />); });
    await act(async () => {
      home.pending[failed].reject();
      if (failed !== "homeBanners") home.pending.homeBanners.resolve([bannerFixture]);
      if (failed !== "celebrities") home.pending.celebrities.resolve(celebrities);
      if (failed !== "featuredLives") home.pending.featuredLives.resolve([featuredLive]);
      if (failed !== "celebrityLives") home.pending.celebrityLives.resolve([]);
      if (failed !== "elinaRaffles") home.pending.elinaRaffles.resolve({ raffles: elinaRaffles });
    });
    expect(view.container.querySelector("[data-managed-home-banner]")).toHaveTextContent("GGGI");
    if (failed !== "celebrities") expect(view.container.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
    if (failed !== "featuredLives") expect(screen.getByText(featuredLive.live.title)).toBeInTheDocument();
    if (failed === "elinaRaffles") expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).not.toBeInTheDocument();
    if (failed !== "celebrityLives") expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
});

it("shows true fans and hearts from the creator ranking on each favorite card (261107-2 D13)", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).startsWith("/api/rankings/creators")
    ? Response.json({ period: "all", periodStart: "1970-01-01", computedAt: null, rows: [{ rank: 1, slug: "kara", name: "KARA", imageUrl: null, score: 1234, jjinfanCount: 56, myHearts: null }] })
    : Response.json({}, { status: 503 })));
  render(<GuestHome {...defaultProps} featuredLives={[]} />);
  const kara = within(screen.getByRole("heading", { name: "KARA", level: 3 }).closest("article")!);
  expect(await kara.findByText("찐팬 56")).toBeVisible();
  expect(kara.getByLabelText("하트 1,234개")).toBeVisible();
  // A creator not in the ranking yet shows 0, not a follower count.
  const elina = within(screen.getByRole("heading", { name: "Elina", level: 3 }).closest("article")!);
  expect(elina.getByText("찐팬 0")).toBeVisible();
  expect(elina.queryByText(/팬 320만/)).toBeNull();
});
