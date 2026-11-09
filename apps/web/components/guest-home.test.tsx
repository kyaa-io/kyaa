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

  it("draws the hero, the ranking, the thin banner slot and the upcoming LIVE in one column, without the fan board, favorites or side panel (7차)", () => {
    const { container } = render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    const hero = container.querySelector("#live-heading")!;
    const ranking = screen.getByTestId("home-ranking");
    const live = container.querySelector("#upcoming")!;
    expect(hero.compareDocumentPosition(ranking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ranking.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("#celebrities")).toBeNull();
    expect(container.querySelector("#guest-context-panel")).toBeNull();
    expect(screen.queryByTestId("home-community-preview")).toBeNull();
    expect(screen.queryByTestId("home-challenges")).toBeNull();
    expect(screen.getAllByTestId("home-ranking")).toHaveLength(1);
  });

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
    expect(screen.getByRole("heading", { name: "Upcoming LIVE" })).toBeInTheDocument();
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
  });

  it("shows retry UI for failed LIVE data without presenting it as an empty LIVE list", () => {
    render(<GuestHome {...defaultProps} featuredLives={[]} contentErrors={{ featuredLives: true }} />);
    expect(screen.queryByText("현재 공개된 LIVE가 없습니다.")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "다시 시도" });
    fireEvent.click(buttons[0]);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
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
    await act(async () => { home.pending.celebrities.resolve(celebrities); home.pending.celebrityLives.resolve([]); home.pending.featuredLives.resolve([featuredLive]); });
    expect(await screen.findByText(featuredLive.live.title)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).not.toBeInTheDocument();
    await act(async () => { home.pending.homeBanners.resolve([bannerFixture]); home.pending.elinaRaffles.resolve({ raffles: elinaRaffles }); });
    expect(screen.getAllByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요", hidden: true }).length).toBeGreaterThan(0);
  });

  it.each(["homeBanners", "featuredLives", "elinaRaffles"] as const)("isolates a failed %s query", async (failed) => {
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome {...home} locale="ko" />); });
    await act(async () => {
      home.pending[failed].reject();
      if (failed !== "homeBanners") home.pending.homeBanners.resolve([bannerFixture]);
      home.pending.celebrities.resolve(celebrities);
      if (failed !== "featuredLives") home.pending.featuredLives.resolve([featuredLive]);
      home.pending.celebrityLives.resolve([]);
      if (failed !== "elinaRaffles") home.pending.elinaRaffles.resolve({ raffles: elinaRaffles });
    });
    expect(view.container.querySelector("[data-managed-home-banner]")).toHaveTextContent("GGGI");
    if (failed !== "featuredLives") expect(screen.getByText(featuredLive.live.title)).toBeInTheDocument();
    if (failed === "elinaRaffles") expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요", hidden: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert", { hidden: true }).length).toBeGreaterThan(0);
  });
});
