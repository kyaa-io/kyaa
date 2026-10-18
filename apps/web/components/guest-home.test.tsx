import { homeLaunchCopy } from "@/i18n/catalogs/features__home-launch";
import { APP_LOCALES } from "@/i18n/locales";
import { bannerFixture } from "../e2e/banner-local/fixture";
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatKoreanLiveDate, formatPassportTier, GuestHome } from "./guest-home";
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

function ownedCreator(slug: string, isPublic = true) {
  return { celebrity: { slug, name: slug, image: `/${slug}.jpg`, isPublic }, relationship: "passport", passport: { id: "11111111-1111-4111-8111-111111111111", tier: "Gold", score: 50, remainingToNextTier: 70 }, ticketBalance: 3, firstReaction: null };
}
function homeSummary(creators: ReturnType<typeof ownedCreator>[] = []) {
  return { profile: { nickname: "private nickname" }, creators, live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: creators.length, stampCount: 10, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 };
}

describe("canonical 03 guest home", () => {
  it.each(APP_LOCALES)("shows the approved favorite-first Home title and activity navigation in %s", (locale) => {
    render(<GuestHome {...defaultProps} featuredLives={[]} locale={locale} />);
    expect(screen.getByRole("heading", { level: 1, name: homeLaunchCopy[locale].title })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: homeLaunchCopy[locale].activity })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: homeLaunchCopy[locale].today })).toHaveAttribute("href", `/fandom?locale=${locale}`);
    expect(screen.getByRole("heading", { name: homeLaunchCopy[locale].news })).toBeInTheDocument();
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

  it("keeps one guest activity sign-in and the public LIVE entry without a Passport preview", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    expect(screen.getAllByRole("link", { name: "로그인하기" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login?locale=ko");
    expect(screen.getByRole("link", { name: "방송 준비하기" })).toHaveAttribute("href", "/live/admin-created-live?locale=ko");
    expect(screen.queryByRole("img", { name: /펼쳐진 Fan Passport/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Fan Passport 발급받기/ })).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
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
    expect(screen.getByRole("heading", { level: 2, name: "정기 LIVE 1" })).toBeInTheDocument();
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

  it("keeps different prize deadlines separate and localizes the login entry", () => {
    render(<GuestHome {...defaultProps} locale="en" featuredLives={[]} homeBanners={[]} elinaRaffles={[
      elinaRaffles[0], { ...elinaRaffles[0], id: "other", entryClosesAt: "2026-10-09T09:00:00+00:00" },
    ]} />);
    expect(screen.getByText("Entry deadline · View details")).toBeInTheDocument();
    expect(screen.queryByText(/2026.10.07/)).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Sign in" })) expect(link).toHaveAttribute("href", "/login?locale=en");
  });

  it("uses the real featured creator image and localizes public and guest actions", () => {
    render(<GuestHome celebrities={celebrities} featuredLives={[featuredLive]} locale="en" />);
    const featured = document.querySelector("[data-home-featured-live]") as HTMLElement;
    expect(within(featured).getByRole("img", { name: "KARA" })).toHaveAttribute("src", expect.stringContaining("kara-card.jpg"));
    expect(within(featured).getByRole("link", { name: "Get ready for LIVE" })).toHaveAttribute("href", "/live/admin-created-live?locale=en");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?locale=en");
    expect(screen.queryByRole("img", { name: /Opened Fan Passport/ })).not.toBeInTheDocument();
  });

  it("uses the same product destinations in desktop and mobile navigation", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);

    const primary = screen.getByRole("navigation", { name: "주요 메뉴" });
    const primaryLinks = within(primary).getAllByRole("link");
    expect(primaryLinks).toHaveLength(4);
    expect(within(primary).getByRole("link", { name: "홈" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(primary).getByRole("link", { name: "덕질" })).toHaveAttribute(
      "href",
      "/fandom?locale=ko",
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

  it("offers all 11 languages and selects the current language", async () => {
    const { rerender } = render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    const selector = screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" });
    expect(selector).toHaveValue("ko");
    fireEvent.click(selector);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(11);
    expect(within(listbox).getByRole("option", { name: "繁體中文" })).toBeInTheDocument();
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
    expect(card.queryByText("12.8M Fans")).toBeInTheDocument();
    expect(card.getByRole("link", { name: "KARA 입덕하기" })).toHaveAttribute("href", "/kara?locale=ko");
    expect(screen.queryByText("3.2M Fans")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Elina 입덕하기" })).toHaveAttribute("href", "/elina?locale=ko");
    expect(screen.queryByText("1.5M Fans")).toBeInTheDocument();
    const changhaCard = screen.getByRole("heading", { name: "Changha", level: 3 }).closest("article");
    expect(within(changhaCard!).getByRole("link", { name: "Changha 입덕하기" })).toHaveAttribute("href", "/changha?locale=ko");
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
    expect(screen.getByRole("img", { name: "Elina portrait" })).toBeInTheDocument();
  });

  it("keeps one activity panel and retains official news separately from the LIVE hero", () => {
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    const panel = screen.getByRole("complementary", { name: "내 활동" });
    expect(within(panel).getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login?locale=ko");
    expect(screen.queryByRole("button", { name: /팬 활동/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "새 소식" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /팬들과 먼저 이야기해요/ })).toHaveAttribute("href", "/community?locale=ko");
    expect(screen.getByRole("link", { name: /좋아하는 마음을 하트로/ })).toHaveAttribute("href", "/support?locale=ko");
    expect(within(screen.getByRole("region", { name: "홈 배너" })).getByRole("heading", { name: "엘리나의 정기 LIVE" })).toBeInTheDocument();
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
    expect(screen.getAllByText("팬 활동을 불러오는 중이에요.")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /이퓨.*100일/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "방송 준비하기" })).toHaveAttribute("href", "/live/admin-created-live?locale=ko");
  });

  it("uses the owner summary for favorite verification while keeping Passport details in MY", async () => {
    privy.authenticated = true;
    const fetcher = vi.fn(async (_url: string) => Response.json({ summary: homeSummary([ownedCreator("kara")]) }));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestHome {...defaultProps} featuredLives={[featuredLive]} />);
    expect(await screen.findByRole("link", { name: "KARA 입덕 완료" })).toHaveAttribute("data-verified");
    const activity = screen.getByRole("complementary", { name: "내 활동" });
    expect(within(activity).getByRole("link", { name: "내 패스포트" })).toHaveAttribute("href", "/passports?locale=ko");
    expect(within(activity).getByRole("link", { name: "오늘의 덕질" })).toHaveAttribute("href", "/fandom?locale=ko");
    expect(screen.queryByText("private nickname")).not.toBeInTheDocument();
    expect(document.querySelector("[data-passport-stamp]")).toBeNull();
    expect(screen.queryByRole("link", { name: "로그인하기" })).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/me/summary?locale=ko&tierStages=1");
  });

  it.each([true, false])("does not publish private reservation details from the MY summary, matching public LIVE: %s", async hasMatchingLive => {
    privy.authenticated = true;
    const summary = { ...homeSummary(), live: { upcoming: [{ id: featuredLive.live.id, slug: "private-reserved-live", title: "Private reservation", startsAt: "2020-01-01T00:00:00Z", effectiveStatus: "scheduled", attended: false }], history: [] } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ summary })));
    render(<GuestHome {...defaultProps} featuredLives={hasMatchingLive ? [featuredLive] : []} />);
    await screen.findByRole("link", { name: "내 패스포트" });
    expect(screen.queryByText("Private reservation")).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="private-reserved-live"]')).toBeNull();
    if (!hasMatchingLive) expect(screen.queryByText("시작 확인 중")).not.toBeInTheDocument();
    if (hasMatchingLive) expect(screen.getByRole("link", { name: "방송 준비하기" })).toHaveAttribute("href", "/live/admin-created-live?locale=ko");
    else expect(screen.getByText("현재 공개된 LIVE가 없습니다.")).toBeInTheDocument();
  });

  it("refreshes favorite verification after an owner activity update without fetching Passport details", async () => {
    privy.authenticated = true;
    const fetcher = vi.fn().mockImplementationOnce(async () => Response.json({ summary: homeSummary() }))
      .mockImplementation(async () => Response.json({ summary: homeSummary([ownedCreator("kara")]) }));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 입덕하기" })).not.toHaveAttribute("data-verified");
    await act(async () => { notifyFanActivityUpdated("owner-a"); });
    expect(await screen.findByRole("link", { name: "KARA 입덕 완료" })).toHaveAttribute("data-verified");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("/api/me/summary"))).toBe(true);
  });

  it("uses multiple owned creators for the favorite filter without loading private Passport artwork", async () => {
    privy.authenticated = true;
    const fetcher = vi.fn(async (_url: string) => Response.json({ summary: homeSummary([ownedCreator("kara"), ownedCreator("elina")]) }));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 입덕 완료" })).toHaveAttribute("data-verified");
    expect(screen.getByRole("link", { name: "Elina 입덕 완료" })).toHaveAttribute("data-verified");
    expect(document.querySelectorAll("#home-creator-rail article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "다음 패스포트" })).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "내 패스포트" })).toHaveAttribute("href", "/passports?locale=ko");
  });

  it("hides unpublished owned creators without changing owned records or fetching private previews", async () => {
    privy.authenticated = true;
    const creators = [ownedCreator("unpublished", false), ownedCreator("elina")];
    const fetcher = vi.fn(async (_url: string) => Response.json({ summary: homeSummary(creators) }));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "Elina 입덕 완료" })).toHaveAttribute("data-verified");
    expect(screen.queryByText("unpublished")).not.toBeInTheDocument();
    expect(document.querySelectorAll("#home-creator-rail article")).toHaveLength(1);
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("/api/me/summary"))).toBe(true);
    view.rerender(<GuestHome {...defaultProps} celebrities={[]} featuredLives={[]} />);
    expect(await screen.findByText("지금 공개된 내 최애가 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "내 패스포트" })).toHaveAttribute("href", "/passports?locale=ko");
    expect(creators).toHaveLength(2);
  });

  it("distinguishes a failed summary from a valid empty collection and retries it", async () => {
    privy.authenticated = true;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockImplementation(async () => Response.json({ summary: homeSummary() }));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("팬 활동을 불러오지 못했어요.");
    expect(screen.queryByRole("link", { name: "내 패스포트" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("link", { name: "내 패스포트" })).toHaveAttribute("href", "/passports?locale=ko");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "KARA 입덕하기" })).not.toHaveAttribute("data-verified");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears owner verification on sign-out and does not reuse it for the next owner", async () => {
    privy.authenticated = true;
    const fetcher = vi.fn().mockImplementationOnce(async () => Response.json({ summary: homeSummary([ownedCreator("kara")]) }))
      .mockImplementation(async () => Response.json({ summary: homeSummary() }));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 입덕 완료" })).toHaveAttribute("data-verified");
    privy.authenticated = false;
    view.rerender(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(screen.getByRole("link", { name: "로그인하기" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "KARA 입덕 완료" })).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    privy.authenticated = true; privy.user.id = "owner-b";
    view.rerender(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 입덕하기" })).not.toHaveAttribute("data-verified");
    expect(fetcher).toHaveBeenCalledTimes(2);
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
    expect(await screen.findByRole("link", { name: "KARA 입덕하기" })).not.toHaveAttribute("data-verified");
    await act(async () => { resolveOld(Response.json({ summary: { ...empty, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg", isPublic: true }, relationship: "passport", passport: { id: "11111111-1111-4111-8111-111111111111", tier: "Gold", score: 50, remainingToNextTier: 70 }, ticketBalance: 0, firstReaction: null }] } })); });
    expect(screen.getByRole("link", { name: "KARA 입덕하기" })).not.toHaveAttribute("data-verified");
  });

  it("does not mark reaction-only creators complete and removes role text only inside cards", async () => {
    privy.authenticated = true;
    const summary = { profile: { nickname: null }, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg", isPublic: true }, relationship: "first_reaction_only", passport: null, ticketBalance: 0, firstReaction: { completedAt: "2026-09-01T00:00:00Z", txHash: null } }], live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 0, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ summary })));
    const { container } = render(<GuestHome {...defaultProps} featuredLives={[]} />);
    expect(await screen.findByRole("link", { name: "KARA 입덕하기" })).not.toHaveAttribute("data-verified");
    expect(screen.queryByRole("link", { name: "KARA 입덕 완료" })).not.toBeInTheDocument();
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
    expect(screen.getAllByText("팬 활동을 불러오는 중이에요.")).toHaveLength(1);
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
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
  expect(within(container.querySelector("#celebrities") as HTMLElement).getByRole("link", { name: "최애 전체 보기" })).toHaveAttribute("href", "/celebrities?locale=ko&role=creator");
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

it.each(["owned", "empty", "error", "guest"] as const)("hides intermediate filters until auth and personalization resolve: %s", async (mode) => {
  privy.ready = false;
  privy.authenticated = mode !== "guest";
  let resolveSummary!: (response: Response) => void;
  const pendingSummary = new Promise<Response>(resolve => { resolveSummary = resolve; });
  const fetcher = vi.fn(async (input: string | URL | Request) => String(input).startsWith("/api/passports/")
    ? Response.json({ passport: { stamps: [], activities: [], stampSummary: { total: 0 } } }) : pendingSummary);
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
  expect(fetcher).not.toHaveBeenCalled();
  privy.ready = true;
  view.rerender(<GuestHome {...defaultProps} featuredLives={[]} />);
  if (mode !== "guest") {
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
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
  expect(within(container.querySelector("#celebrities") as HTMLElement).getByRole("link", { name: "최애 전체 보기" })).toHaveAttribute("href", "/celebrities?locale=ko&owned=1");
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
  expect(within(loadingSection).getByText("보유한 Fan Passport를 확인하고 있어요.")).toBeInTheDocument();
  expect(loadingSection.querySelectorAll("article")).toHaveLength(0);
  loading.unmount();

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
  const failed = render(<GuestHome {...defaultProps} featuredLives={[]} initialOwnedOnly />);
  const failedSection = failed.container.querySelector("#celebrities") as HTMLElement;
  expect(await within(failedSection).findByRole("alert")).toHaveTextContent("보유한 Fan Passport를 확인하지 못했어요.");
  expect(within(failedSection).queryByText("아직 보유한 Fan Passport가 없어요.")).not.toBeInTheDocument();
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
  expect(await within(section).findByText(passportCount > 0 ? "지금 공개된 내 최애가 없어요." : "아직 보유한 Fan Passport가 없어요.")).toBeInTheDocument();
  fireEvent.click(within(section).getByRole("button", { name: "전체 보기" }));
  expect(section.querySelectorAll("#home-creator-rail article")).toHaveLength(3);
  expect(new URL(window.location.href).searchParams.get("owned")).toBeNull();
});
});
vi.mock("@/features/live/ui/observed-live-strip", () => ({ ObservedLiveStrip: () => null }));
