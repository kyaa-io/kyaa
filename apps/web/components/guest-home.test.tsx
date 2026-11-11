import type { BannerSlotMap, HomeBanner } from "@/features/home/domain/home-banner";
import type { PublishedCelebrity } from "@/server/content/content-domain";
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
import { formatPassportTier, GuestHome, StreamingGuestHome } from "./guest-home";
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
  const challenges = { state: { status: "ready", data: { items: [{ slug: "kara", name: "KARA", imageUrl: null, title: "찐팬 100명", description: "", endsOn: null, count: 40, hearts: 61, target: 100 }] } }, retry: () => undefined };
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
    render(<GuestHome {...defaultProps} />);
    expect(screen.getByRole("link", { name: /전체 이벤트/ })).toHaveAttribute("href", "/events?locale=ko");
  });

  it("draws the hero, the ranking, the thin banner slot, the notices and the gallery in one column, without an upcoming LIVE block, the fan board, favorites or side panel (7차)", () => {
    const { container } = render(<GuestHome {...defaultProps} />);
    const hero = container.querySelector("#live-heading")!;
    const ranking = screen.getByTestId("home-ranking");
    const notices = container.querySelector("[data-home-block=notices]")!;
    const gallery = container.querySelector("[data-home-block=gallery]")!;
    expect(hero.compareDocumentPosition(ranking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ranking.compareDocumentPosition(notices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notices.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 2026-11-09 user decision: the "다가오는 LIVE" block is gone from Home (the LIVE list, calendar and fan pages keep their own).
    expect(container.querySelector("#upcoming")).toBeNull();
    expect(screen.queryByRole("heading", { name: "다가오는 LIVE" })).toBeNull();
    expect(screen.queryByRole("link", { name: /전체 라이브/ })).toBeNull();
    expect(container.querySelector("#celebrities")).toBeNull();
    expect(container.querySelector("#guest-context-panel")).toBeNull();
    expect(screen.queryByTestId("home-community-preview")).toBeNull();
    expect(screen.queryByTestId("home-challenges")).toBeNull();
    expect(screen.getAllByTestId("home-ranking")).toHaveLength(1);
  });

  it("shows the 찐팬 100 strip only when the server flag is on", () => {
    const off = render(<GuestHome {...defaultProps} />);
    expect(off.container.querySelector("[data-home-jjinfan-strip]")).toBeNull();
    off.unmount();
    const on = render(<GuestHome {...defaultProps} jjinfanGauge />);
    expect(on.container.querySelector("[data-home-jjinfan-strip]")).not.toBeNull();
  });
  it("draws the thin banner from the slot read with the page, before the notices, and nothing when the slot is empty", () => {
    const thin = { ...bannerFixture, id: "44444444-4444-4444-8444-444444444444", title: "얇은 띠", placement: "home_below_board" as const };
    const first = render(<GuestHome {...defaultProps} homeSlots={{ home_below_board: thin }} />);
    const strip = first.container.querySelector("[data-home-thin-banner]")!;
    expect(strip).toBeTruthy();
    expect(screen.getByTestId("home-ranking").compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(first.container.querySelector("[data-home-block=notices]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();
    const second = render(<GuestHome {...defaultProps} />);
    expect(second.container.querySelector("[data-home-thin-banner]")).toBeNull();
  });

  it("keeps loading notice and shortform states free of empty rows", () => {
    const { container } = render(<GuestHome {...defaultProps} />);
    const notices = container.querySelector("[data-home-block=notices]")!;
    const gallery = container.querySelector("[data-home-block=gallery]")!;
    expect(within(notices as HTMLElement).getByRole("heading", { name: "공지사항" })).toBeInTheDocument();
    // No notice read happened here, so it is not "none yet" (20:52: the empty text is only for a read that found nothing).
    expect(within(notices as HTMLElement).queryByText("아직 공지 없음")).not.toBeInTheDocument();
    expect(notices.querySelectorAll("li")).toHaveLength(0);
    expect(within(gallery as HTMLElement).getByRole("heading", { name: "갤러리" })).toBeInTheDocument();
    expect(within(gallery as HTMLElement).getByRole("heading", { name: "숏폼" })).toBeInTheDocument();
    expect(gallery.querySelectorAll("[data-row=photo-placeholder]")).toHaveLength(8);
    expect(gallery.querySelectorAll("[data-row=short-placeholder]")).toHaveLength(0);
    expect(notices.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(APP_LOCALES)("shows the approved Kyaa slogan in %s", (locale) => {
    render(<GuestHome {...defaultProps} locale={locale} />);
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

  it("hydrates the server Home markup without a text mismatch", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<GuestHome {...defaultProps} />);
    document.body.append(container);

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <GuestHome {...defaultProps} />); });

    expect(container).toHaveTextContent("엘리나의 정기 LIVE");
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match|server rendered html/i);
    expect(consoleWarn.mock.calls.flat().join(" ")).not.toMatch(/width or height|aspect.ratio/i);
    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it("uses the Elina participation guide as the final LIVE hero slide", () => {
    render(<GuestHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "다음 배너" }));
    const hero = screen.getByRole("region", { name: "홈 배너" });
    expect(within(hero).getByRole("heading", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).toBeInTheDocument();
    expect(within(hero).getByText("팬 인증하고 응모권을 받아 원하는 선물에 응모하세요.")).toBeInTheDocument();
    expect(within(hero).getByText("뱅크시 전시 티켓 · 60명 추첨")).toBeInTheDocument();
    expect(within(hero).getByText(/응모 마감/)).toBeInTheDocument();
    expect(within(hero).getByText("2026.10.07 18:00 (KST)")).toHaveAttribute("datetime", "2026-10-07T09:00:00+00:00");
    expect(within(hero).getByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" }))
      .toHaveAttribute("href", "/c/elina/raffles?locale=ko");
  });

  it("preserves the guide when independent banner loading fails", () => {
    render(<GuestHome {...defaultProps} homeBanners={[]} contentErrors={{ homeBanners: true }} />);
    expect(within(screen.getByRole("region", { name: "홈 배너" })).getByRole("heading", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).toBeInTheDocument();
  });

  it.each(["closed", "cancelled"] as const)("does not promote %s raffle dates as open entries", status => {
    render(<GuestHome {...defaultProps} homeBanners={[]} elinaRaffles={[{ ...elinaRaffles[0], status }]} />);
    expect(screen.queryByText(/2026.10.07/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: status === "closed" ? "응모가 끝났어요" : "래플이 취소됐어요" })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "응모 내역 확인" })) {
      expect(link).toHaveAttribute("href", "/my/raffles?locale=ko");
    }
  });

  it("keeps different prize deadlines separate", () => {
    render(<GuestHome {...defaultProps} locale="en" homeBanners={[]} elinaRaffles={[
      elinaRaffles[0], { ...elinaRaffles[0], id: "other", entryClosesAt: "2026-10-09T09:00:00+00:00" },
    ]} />);
    expect(screen.getByText("Entry deadline · View details")).toBeInTheDocument();
    expect(screen.queryByText(/2026.10.07/)).not.toBeInTheDocument();
  });

  it("uses the same product destinations in desktop and mobile navigation", () => {
    render(<GuestHome {...defaultProps} />);

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
    const { rerender } = render(<GuestHome {...defaultProps} />);
    const selector = screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" });
    expect(selector).toHaveValue("ko");
    fireEvent.click(selector);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(APP_LOCALES.length);
    expect(within(listbox).getByRole("option", { name: "繁體中文" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Русский" })).toBeInTheDocument();
    fireEvent.keyDown(listbox, { key: "Escape" });
    rerender(<GuestHome celebrities={celebrities} locale="en" />);
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
  });

  it("auto-advances on desktop and stays manual after arrow navigation", () => {
    vi.useFakeTimers();
    // jsdom never finishes loading pictures; the carousel waits for the next slide's picture in a browser.
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    render(<GuestHome {...defaultProps} homeBanners={[bannerFixture, { ...bannerFixture, id: "second", title: "다음 정기 방송" }]} />);

    expect(screen.getByRole("heading", { name: "엘리나의 정기 LIVE", level: 2 })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole("heading", { name: "다음 정기 방송", level: 2 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이전 배너" }));
    expect(screen.getByRole("heading", { name: "엘리나의 정기 LIVE", level: 2 })).toBeInTheDocument();
    const carousel = screen.getByRole("region", { name: "홈 배너" });
    expect(within(carousel).getByText("01 | 03")).toBeInTheDocument();
    expect(carousel).toHaveAttribute("data-shine-paused", "true");
    expect(within(carousel).queryByRole("button", { name: /번째 배너 보기|자동 재생 정지/ })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(12_000));
    expect(within(carousel).getByRole("heading", { name: "엘리나의 정기 LIVE", level: 2 })).toBeInTheDocument();
    fireEvent.click(within(carousel).getByRole("button", { name: "다음 배너" }));
    expect(within(carousel).getByText("02 | 03")).toBeInTheDocument();
    expect(within(carousel).getByRole("heading", { name: "다음 정기 방송", level: 2 })).toBeInTheDocument();
  });

  it("pauses automatic playback during hover and disables it for reduced motion", () => {
    vi.useFakeTimers();
    const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
    }));
    render(<GuestHome {...defaultProps} homeBanners={[bannerFixture, { ...bannerFixture, id: "second", title: "다음 정기 방송" }]} />);

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
    render(<GuestHome {...defaultProps} />);

    expect(screen.queryByRole("link", { name: "로그인하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /이퓨.*100일/ })).not.toBeInTheDocument();
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
      homeSlots: deferred<BannerSlotMap>(),
      elinaRaffles: deferred<RaffleList>(),
    };
    const queries: HomeQueries = {
      homeBanners: settleHomeQuery(pending.homeBanners.promise),
      celebrities: settleHomeQuery(pending.celebrities.promise),
      homeSlots: settleHomeQuery(pending.homeSlots.promise),
      elinaRaffles: settleHomeQuery(pending.elinaRaffles.promise),
      homeNotices: settleHomeQuery(Promise.resolve({ items: [], nextCursor: null })),
      homeGallery: settleHomeQuery(Promise.resolve({ items: [], nextCursor: null })),
      homeShorts: settleHomeQuery(Promise.resolve([])),
    };
    return { pending, queries };
  }

  it("shows the real GGGI banner immediately and releases each section without waiting for optional queries", async () => {
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome {...home} locale="ko" />); });
    expect(view.container.querySelector("[data-managed-home-banner]")).toHaveTextContent("GGGI");
    expect([...view.container.querySelectorAll("[data-managed-home-banner]")].slice(0, 2).map(el => el.getAttribute("data-managed-home-banner"))).toEqual(["8bf2f180-cb32-4f00-93e2-e84b570ad450", "247861a1-27b0-4e0a-9039-b5f8f7bc1c48"]);
    expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).not.toBeInTheDocument();
    await act(async () => { home.pending.celebrities.resolve(celebrities); home.pending.homeSlots.resolve({}); });
    expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요" })).not.toBeInTheDocument();
    await act(async () => { home.pending.homeBanners.resolve([bannerFixture]); home.pending.elinaRaffles.resolve({ raffles: elinaRaffles }); });
    expect(screen.getAllByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요", hidden: true }).length).toBeGreaterThan(0);
  });

  it("renders ready home sections before gallery data, then reserves photo geometry while Shorts is pending", async () => {
    const photos = (await import("@/server/home-gallery/fixtures/read_public_home_gallery_photos.json")).default.items;
    const home = pendingHome();
    const gallery = deferred<{ items: never[]; nextCursor: null }>();
    const shorts = deferred<never[]>();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome locale="ko" queries={{ ...home.queries,
      homeGallery: settleHomeQuery(gallery.promise),
      homeShorts: settleHomeQuery(shorts.promise) }} />); });
    // The gallery is unresolved, but independent queries may render immediately.
    expect(view.container.querySelector('[data-home-measure="photos"][data-home-state="loading"]')).not.toBeNull();
    expect(screen.getByText("아직 공지 없음")).toBeInTheDocument();
    await act(async () => {
      home.pending.homeBanners.resolve([bannerFixture]);
    });
    expect(view.container.querySelector(`[data-managed-home-banner="${bannerFixture.id}"]`)).not.toBeNull();
    expect(view.container.querySelector('[data-gallery-layout]')).toBeNull();
    await act(async () => { gallery.resolve({ items: photos as never, nextCursor: null }); });
    expect(view.container.querySelectorAll('[data-gallery-reservation="mobile"] li')).toHaveLength(photos.length);
    await act(async () => { shorts.resolve([]); });
    expect(view.container.querySelector('[data-gallery-reservation]')).toBeNull();
    expect(view.container.querySelectorAll('[data-gallery-layout="mobile"] [data-row="photo"]')).toHaveLength(photos.length);
  });

  it("puts the read gallery photos and LIVE videos on the home; a failed read keeps placeholders without the empty text, zero rows show it", async () => {
    const photos = (await import("@/server/home-gallery/fixtures/read_public_home_gallery_photos.json")).default.items;
    const shorts = (await import("@/server/home-gallery/fixtures/read_public_home_shorts.json")).default;
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome queries={{ ...home.queries, homeGallery: Promise.resolve({ status: "fulfilled", value: { items: photos as never, nextCursor: null } }), homeShorts: Promise.resolve({ status: "fulfilled", value: shorts as never }) }} locale="ko" />); });
    expect(view.container.querySelectorAll('[data-gallery-layout="mobile"] [data-row="photo"]')).toHaveLength(photos.length);
    expect(view.container.querySelectorAll('[data-row="short"]')).toHaveLength(shorts.length);
    view.unmount();
    await act(async () => { view = render(<StreamingGuestHome queries={{ ...pendingHome().queries, homeGallery: Promise.resolve({ status: "rejected" }), homeShorts: Promise.resolve({ status: "rejected" }) }} locale="ko" />); });
    expect(view.container.querySelectorAll('[data-row="photo-placeholder"]')).toHaveLength(8);
    expect(view.container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(0);
    // A failed read is not "none yet".
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("아직 숏폼 없음")).not.toBeInTheDocument();
    view.unmount();
    await act(async () => { view = render(<StreamingGuestHome queries={{ ...pendingHome().queries, homeGallery: Promise.resolve({ status: "fulfilled", value: { items: [], nextCursor: null } }), homeShorts: Promise.resolve({ status: "fulfilled", value: [] }) }} locale="ko" />); });
    expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
    expect(screen.queryByText("아직 숏폼 없음")).not.toBeInTheDocument();
  });

  it.each(["homeBanners", "elinaRaffles"] as const)("isolates a failed %s query", async (failed) => {
    const home = pendingHome();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StreamingGuestHome {...home} locale="ko" />); });
    await act(async () => {
      home.pending[failed].reject();
      if (failed !== "homeBanners") home.pending.homeBanners.resolve([bannerFixture]);
      home.pending.celebrities.resolve(celebrities);
      home.pending.homeSlots.resolve({});
      if (failed !== "elinaRaffles") home.pending.elinaRaffles.resolve({ raffles: elinaRaffles });
    });
    expect(view.container.querySelector("[data-managed-home-banner]")).toHaveTextContent("GGGI");
    if (failed === "elinaRaffles") expect(screen.queryByRole("link", { name: "엘리나와 함께 뱅크시 전시 보러 가요", hidden: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert", { hidden: true }).length).toBeGreaterThan(0);
  });
});
