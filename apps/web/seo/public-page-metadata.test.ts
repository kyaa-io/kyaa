import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/analytics/client/vercel-telemetry", () => ({ VercelTelemetry: () => null }));

const mocks = vi.hoisted(() => ({ creator: vi.fn(), live: vi.fn(), raffles: vi.fn(), benefit: vi.fn() }));
vi.mock("@/server/seo/public-content", () => ({ loadSeoCreator: mocks.creator, loadSeoLive: mocks.live, loadSeoRaffles: mocks.raffles, loadSeoBenefit: mocks.benefit }));
vi.mock("@/server/g4/benefit-repository", () => ({ createBenefitRepositoryFromEnvironment: () => ({ find: mocks.benefit }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({}) }));
vi.mock("@/components/celebrity-fan-page", () => ({ CelebrityFanPage: () => null }));
vi.mock("@/features/live/ui/live-event-screen", () => ({ LiveEventScreen: () => null }));
vi.mock("@/features/benefit/ui/creator-raffles-screen", () => ({ CreatorRafflesScreen: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));

import { generateMetadata as creatorMetadata } from "@/app/[slug]/page";
import { generateMetadata as liveMetadata } from "@/app/live/[slug]/page";
import * as raffleList from "@/app/c/[slug]/raffles/page";
import * as raffleDetail from "@/app/c/[slug]/raffles/[benefitId]/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.creator.mockResolvedValue({ name: "Elina", summary: "Creator news", image: { url: "/creator.png", alt: "Elina" } });
  mocks.live.mockResolvedValue({ live: { title: "Fan LIVE", description: "Watch together", startsAt: "2026-10-18T12:00:00Z", celebrity: { name: "Elina" }, heroImage: { url: "/live.png", alt: "LIVE" }, watch: { provider: "youtube" } } });
  mocks.raffles.mockResolvedValue({ raffles: [{ benefitId: "gift-id", title: "Fan gift", summary: "A gift for fans", imageUrl: "/gift.png" }] });
  mocks.benefit.mockResolvedValue({ deliveryLabel: "On site" });
});

describe("public detail search metadata", () => {
  it.each([creatorMetadata, liveMetadata])("canonicalizes fallback content to its actual English translation", async (generate) => {
    const metadata = await generate({ params: Promise.resolve({ slug: "elina" }), searchParams: Promise.resolve({ locale: "ja" }) });
    expect(metadata.alternates?.canonical).toMatch(/\?locale=en$/);
    expect(metadata.openGraph).toMatchObject({ locale: "en_US" });
    expect(Object.values(metadata.alternates?.languages ?? {})).toContain(metadata.alternates?.canonical);
  });

  it("shares the requested public gift, rather than the site's default card", async () => {
    const metadata = await raffleDetail.generateMetadata({ params: Promise.resolve({ slug: "elina", benefitId: "gift-id" }), searchParams: Promise.resolve({ locale: "ja" }) });
    expect(metadata.title).toBe("Fan gift | Elina | kyaa");
    expect(metadata.description).toBe("A gift for fans");
    expect(metadata.alternates?.canonical).toBe("https://kyaa.io/c/elina/raffles/gift-id?locale=en");
    expect(metadata.openGraph).toMatchObject({ images: [{ alt: "Fan gift" }] });
  });

  it("gives the public gift catalog its own canonical URL", async () => {
    const metadata = await raffleList.generateMetadata({ params: Promise.resolve({ slug: "elina" }), searchParams: Promise.resolve({ locale: "ko" }) });
    expect(metadata.title).toBe("Elina의 선물 | kyaa");
    expect(metadata.alternates?.canonical).toBe("https://kyaa.io/c/elina/raffles?locale=ko");
  });

  it("does not generate cards for missing or unpublished gifts", async () => {
    mocks.raffles.mockResolvedValue({ raffles: [] });
    await expect(raffleDetail.generateMetadata({ params: Promise.resolve({ slug: "elina", benefitId: "missing" }), searchParams: Promise.resolve({ locale: "ko" }) })).rejects.toThrow("not-found");
  });

  it("does not publish a teaser's metadata when its benefit detail is unavailable", async () => {
    mocks.benefit.mockResolvedValue(null);
    await expect(raffleDetail.generateMetadata({ params: Promise.resolve({ slug: "elina", benefitId: "gift-id" }), searchParams: Promise.resolve({ locale: "ko" }) })).rejects.toThrow("not-found");
  });

  it("omits an alternate whose gift detail has no published translation", async () => {
    mocks.benefit.mockImplementation(async (_id, locale) => locale === "ko" ? {} : null);
    const metadata = await raffleDetail.generateMetadata({ params: Promise.resolve({ slug: "elina", benefitId: "gift-id" }), searchParams: Promise.resolve({ locale: "ko" }) });
    expect(metadata.alternates?.languages).toEqual({ ko: "https://kyaa.io/c/elina/raffles/gift-id?locale=ko" });
  });
});
