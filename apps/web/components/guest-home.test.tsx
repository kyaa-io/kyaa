import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
import type { HomeBanner } from "@/features/home/domain/home-banner";

const h = vi.hoisted(() => ({
  auth: { ready: true, authenticated: false },
  bias: { status: "guest", selected: null as null | Record<string, unknown> },
  feed: undefined as unknown,
  group: undefined as unknown,
  urls: [] as (string | null)[],
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => h.auth }));
vi.mock("@/features/selected-bias/ui/use-selected-bias", () => ({ useSelectedBias: () => ({ ...h.bias, options: [], unverified: null, select: () => {}, retry: () => {} }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupResource: (url: string | null, parse: (v: unknown) => unknown) => {
  h.urls.push(url);
  const raw = url?.includes("/feed") ? h.feed : url?.includes("/resolve/") ? h.group : undefined;
  return { data: raw === undefined ? undefined : parse(raw), loading: Boolean(url) && raw === undefined, error: false, retry: () => {} };
} }));
vi.mock("@/features/rankings/ui/home-ranking-card", async (importActual) => ({ ...(await importActual<object>()), HomeRankingCard: () => <section data-block="ranking" data-testid="ranking" /> }));
vi.mock("@/features/rankings/ui/home-challenges", () => ({ HomeChallenges: () => <section data-block="challenge" data-testid="challenge" /> }));
vi.mock("@/components/fan-shell/fan-app-shell", async (importActual) => ({ ...(await importActual<object>()), FanAppFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { GuestHome } from "./guest-home";

afterEach(() => { h.auth = { ready: true, authenticated: false }; h.bias = { status: "guest", selected: null }; h.feed = undefined; h.group = undefined; h.urls = []; });

const live = (status: "live" | "scheduled", startsAt = new Date(Date.now() + 3_600_000).toISOString()) => ({
  live: { id: "819b52d9-62c3-450c-b3dc-78d84d2238c6", slug: "live-a", effectiveStatus: status, startsAt, endsAt: null, reservationOpensAt: startsAt, reservationClosesAt: startsAt,
    title: "11월 정기 LIVE", description: "d", productContext: null, heroImage: { url: "/images/live.jpg", alt: "LIVE" },
    celebrity: { slug: "ipyu", name: "이퓨", image: "/images/ipyu.jpg", fanCount: 1200 }, brand: null, watch: { available: false, provider: "youtube", url: null } },
  viewer: { authenticated: false, passport: "missing", reservation: null }, primaryAction: "sign_in_to_reserve",
}) as unknown as LiveEventResponse;
const banner = { id: "8bf2f180-cb32-4f00-93e2-e84b570ad450", kind: "announcement", celebrityId: null, title: "운영 배너", description: "", ctaLabel: "보기", href: "/events", alt: "배너",
  desktopImage: { id: "8bf2f180-cb32-4f00-93e2-e84b570ad451", url: "/images/banner.jpg", width: 1600, height: 900, mimeType: "image/jpeg", revision: 1 }, mobileImage: null } as HomeBanner;
const notice = (id: string, title: string, postType: "notice" | "artist_post", publishedAt: string) => ({ kind: "notice", id, slug: `n-${id.slice(0, 4)}`, title, pinned: false, noticeKind: "standard", postType, visibility: "public", revision: 1, publishedAt, body: { type: "doc", content: [] }, commentCount: 0 });
const favorite = { slug: "ipyu", name: "이퓨", image: "/images/ipyu.jpg", tier: "Bronze", hearts: 0 };

it("signed out: hero = operator banner, no 내 최애 소식, the favorite card asks to sign in (the home's one primary), no board/upcoming/creators", () => {
  const { container } = render(<GuestHome locale="ko" featuredLives={[]} homeBanners={[banner]} />);
  const hero = container.querySelector('[data-block="hero"]')!;
  expect(hero).toHaveAttribute("data-hero-kind", "banner");
  expect(within(hero as HTMLElement).getByRole("heading", { level: 1 })).toHaveTextContent("운영 배너");
  expect(container.querySelector('[data-block="feed"]')).toBeNull();
  const card = container.querySelector('[data-block="aside-card"]')!;
  expect(within(card as HTMLElement).getByRole("link", { name: "로그인하고 최애 고르기" })).toHaveAttribute("href", expect.stringContaining("/login"));
  expect(container.querySelectorAll('[data-fan-action-emphasis="primary"]')).toHaveLength(1);
  expect(container.textContent).not.toMatch(/팬게시판|다가오는 LIVE|Every Fan Moment/);
  expect(container.querySelector('[data-layout="two-col"]')!.children).toHaveLength(2);
});

it("a LIVE in progress takes the hero over the favorite's news and the banner", () => {
  h.auth = { ready: true, authenticated: true }; h.bias = { status: "ready", selected: favorite };
  h.feed = { items: [notice("10000000-0000-4000-8000-000000000001", "공지 하나", "notice", "2026-11-08T04:47:00.000Z")], nextCursor: null, unavailableSources: [] };
  const { container } = render(<GuestHome locale="ko" featuredLives={[live("live")]} homeBanners={[banner]} />);
  const hero = container.querySelector('[data-block="hero"]')!;
  expect(hero).toHaveAttribute("data-hero-kind", "live");
  expect(hero.textContent).toContain("LIVE 중");
  expect(hero.querySelector('a')).toHaveAttribute("href", "/live/live-a?locale=ko");
});

it("signed in with a favorite: official post hero with a feed date and the next LIVE as one meta item; news lists artist posts first; 팬페이지 보기 primary with 팬 N", () => {
  h.auth = { ready: true, authenticated: true }; h.bias = { status: "ready", selected: favorite };
  h.feed = { items: [
    notice("10000000-0000-4000-8000-000000000001", "굿즈 2차 예약 안내", "notice", "2026-11-08T04:47:00.000Z"),
    notice("10000000-0000-4000-8000-000000000002", "오늘 연습실 사진", "artist_post", "2026-11-07T12:10:00.000Z"),
  ], nextCursor: null, unavailableSources: [] };
  h.group = { page: { id: "10000000-0000-4000-8000-000000000009", kind: "fan", celebrityId: null, slug: "ipyu", name: "이퓨", description: "", imageUrl: null, question: null, memberCount: 12345 }, membership: null, bookmarked: false };
  const { container } = render(<GuestHome locale="ko" featuredLives={[live("scheduled")]} homeBanners={[banner]} />);
  const hero = container.querySelector('[data-block="hero"]')!;
  expect(hero).toHaveAttribute("data-hero-kind", "official");
  expect(hero.querySelector("[data-meta]")!.textContent).toMatch(/^공식 소식 · \d{2}\. \d{2}\. \d{2}:\d{2} · LIVE \d{2}\. \d{2}\. \d{2}:\d{2}$/);
  const rows = container.querySelectorAll('[data-block="feed"] li[data-row="notice"]');
  expect([...rows].map((row) => row.textContent)).toEqual([expect.stringContaining("오늘 연습실 사진"), expect.stringContaining("굿즈 2차 예약 안내")]);
  expect(h.urls).toContain("/api/celebrities/ipyu/feed?locale=ko&source=official&limit=10");
  const card = container.querySelector('[data-block="aside-card"]') as HTMLElement;
  expect(within(card).getByRole("link", { name: "팬페이지 보기" })).toHaveAttribute("href", "/ipyu?locale=ko");
  expect(card.textContent).toContain("팬 12.3K");
  expect(container.querySelectorAll('[data-fan-action-emphasis="primary"]')).toHaveLength(1);
  expect(container.textContent).not.toMatch(/(분|시간) 전/);
});

it("signed in without a favorite: banner hero, a 48px row to choose one, and 최애 고르기 as the primary", () => {
  h.auth = { ready: true, authenticated: true }; h.bias = { status: "empty", selected: null };
  const { container } = render(<GuestHome locale="ko" featuredLives={[]} homeBanners={[banner]} />);
  expect(container.querySelector('[data-block="hero"]')).toHaveAttribute("data-hero-kind", "banner");
  const feed = container.querySelector('[data-block="feed"]') as HTMLElement;
  expect(within(feed).getByRole("link", { name: "최애 고르기" })).toHaveAttribute("data-row", "menu");
  expect(screen.getAllByRole("link", { name: "최애 고르기" })).toHaveLength(2);
});

it("a favorite with no posts shows one gray sentence", () => {
  h.auth = { ready: true, authenticated: true }; h.bias = { status: "ready", selected: favorite };
  h.feed = { items: [], nextCursor: null, unavailableSources: [] };
  const { container } = render(<GuestHome locale="ko" featuredLives={[]} homeBanners={[banner]} />);
  const empty = container.querySelector('[data-block="feed"] [data-fan-state="empty"]')!;
  expect(empty.textContent).toBe("새 소식이 없습니다");
  expect(container.querySelector('[data-block="hero"]')).toHaveAttribute("data-hero-kind", "banner");
});
