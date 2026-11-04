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

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privy,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: routerActions.push, refresh: routerRefresh }),
}));

const base = (slug: string, name: string, order: number) => ({ slug, locale: "ko" as const, name, summary: `${name} summary`, image: { url: `/images/guest-home/${slug}-card.jpg`, alt: `${name} portrait`, position: "center" }, roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: order, fanCount: 1000 });
const celebrities = [base("kara", "KARA", 0), base("elina", "Elina", 1), base("changha", "Changha", 2), base("mina", "Mina", 3)] as const;
const creator = (slug: string, name: string, id: string) => ({ celebrity: { slug, name, image: `/images/guest-home/${slug}-card.jpg`, isPublic: true }, relationship: "passport", passport: { id, tier: "Silver", score: 15, remainingToNextTier: 35, stageProgress: { policyVersion: 2, current: { key: "silver-1", tier: "Silver", subdivision: 1, rank: 2, minimumScore: 15 }, next: { key: "silver-2", tier: "Silver", subdivision: 2, rank: 3, minimumScore: 30 }, remaining: 15, progressPercent: 0 } }, ticketBalance: 0, firstReaction: null });
const summary = (creators: unknown[]) => ({ summary: { profile: { nickname: "카밀리아" }, creators, live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: creators.length, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 } });
const props = { homeBanners: [bannerFixture], celebrities, elinaRaffles: [], locale: "ko" as const, featuredLives: [] };

afterEach(() => {
  privy.ready = true;
  privy.authenticated = false;
  routerActions.push.mockReset();
  vi.unstubAllGlobals();
});

describe("home verified passport rows (integration)", () => {
  it("lists at most three verified creators under the passport carousel in each of the two home placements", async () => {
    privy.authenticated = true;
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(summary(celebrities.map((c, i) => creator(c.slug, c.name, ids[i]))))));
    render(<GuestHome {...props} />);
    await screen.findAllByText("카밀리아님, 반가워요.");
    const lists = screen.getAllByRole("list", { name: "내 패스포트" });
    expect(lists).toHaveLength(2);
    lists.forEach((list) => {
      const rows = within(list).getAllByRole("link");
      expect(rows.map((row) => row.textContent)).toEqual(["KARA", "Elina", "Changha"]);
      expect(rows[0]).toHaveAttribute("href", "/kara?locale=ko");
      expect(list.previousElementSibling).not.toBeNull();
    });
    expect(document.querySelector('a[href^="/passports"]')).not.toBeNull();
  });

  it("keeps the existing empty passport state without rows when there is no verified creator", async () => {
    privy.authenticated = true;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(summary([]))));
    render(<GuestHome {...props} />);
    await screen.findAllByText("카밀리아님, 반가워요.");
    expect(screen.queryByRole("list", { name: "내 패스포트" })).not.toBeInTheDocument();
  });
});
