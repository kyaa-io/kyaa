import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  creator: { slug: "runmusic", roles: ["brand"] as string[] },
  listPrimaryLives: vi.fn(async () => [{ slug: "festival-live", celebritySlug: "runmusic" }]),
  redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }),
  challenge: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock("@/server/fanpage/public-cheer-event", () => ({readPublicCheerEvent:vi.fn(async()=>null)}));
vi.mock("@/server/seo/public-content", () => ({ loadSeoCreator: vi.fn(async () => mocks.creator) }));
vi.mock("@/server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ listPrimaryLives: mocks.listPrimaryLives }) }));
vi.mock("@/components/celebrity-fan-page", () => ({ CelebrityFanPage: () => <div>Fan page</div> }));
vi.mock("@/server/rankings/jjinfan-share", () => ({ readSharedJjinfanChallenge: mocks.challenge, readJjinfanSeed: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not-found"); }), redirect: mocks.redirect }));

import CelebrityPage from "./page";

describe("brand public page routing", () => {
  it.each(["raffles", "benefits"])("preserves the shared %s catalog and auth intent", async (tab) => {
    const authIntent = "11111111-1111-4111-8111-111111111111";
    await expect(CelebrityPage({ params: Promise.resolve({ slug: "runmusic" }), searchParams: Promise.resolve({ locale: "ja", tab, authIntent }) }))
      .rejects.toThrow(`redirect:/c/runmusic/raffles?locale=ja&authIntent=${authIntent}`);
  });

  it.each(["live", "media"])("loads the shared brand %s destination", async (tab) => {
    const page = await CelebrityPage({ params: Promise.resolve({ slug: "runmusic" }), searchParams: Promise.resolve({ locale: "ko", tab }) });
    expect(page.props.children.props).toMatchObject({
      initialTab: "board", initialBoardSection: tab,
      upcomingLive: { slug: "festival-live", celebritySlug: "runmusic" },
    });
    expect(mocks.listPrimaryLives).toHaveBeenCalledWith("ko");
  });
});

it("does not load private Wave lives or cheers into the server payload", async () => {
  mocks.listPrimaryLives.mockClear();
  const { readPublicCheerEvent } = await import("@/server/fanpage/public-cheer-event");
  vi.mocked(readPublicCheerEvent).mockClear();
  const page = await CelebrityPage({ params: Promise.resolve({ slug: "kyaa-wave-fanpage" }), searchParams: Promise.resolve({ locale: "ko" }) });
  expect(page.type.name).toBe("WaveAccessBoundary");
  expect(mocks.listPrimaryLives).not.toHaveBeenCalled();
  expect(readPublicCheerEvent).not.toHaveBeenCalled();
});

describe("creator link preview photo", () => {
  it("previews Changha's chosen autumn portrait, not the GGGI hero (11/17)", async () => {
    const { generateMetadata } = await import("./page");
    const before = mocks.creator;
    Object.assign(mocks, { creator: { slug: "changha", roles: ["creator"], name: "창하", summary: "소개", image: { url: "/images/celebrities/changha/gggi-20261030.jpg", alt: "창하", photos: [] } } });
    try {
      const meta = await generateMetadata({ params: Promise.resolve({ slug: "changha" }), searchParams: Promise.resolve({ locale: "en" }) });
      const og = JSON.stringify(meta.openGraph);
      expect(og).toContain("profile-autumn-sharp-20261113.webp");
      expect(og).not.toContain("gggi-20261030");
    } finally { Object.assign(mocks, { creator: before }); }
  });
});

describe("jjinfan share preview", () => {
  const creator = { slug: "elina", roles: ["creator"], name: "엘리나", summary: "소개", image: { url: "/images/elina.jpg", alt: "엘리나", photos: [] } };
  it("previews the live gauge only for a share link while the challenge is on", async () => {
    const { generateMetadata } = await import("./page");
    const before = mocks.creator;
    Object.assign(mocks, { creator });
    try {
      mocks.challenge.mockResolvedValueOnce({ count: 47, target: 100, campaign: { title: "찐팬 100명", description: "같이 채워요" } });
      const shared = await generateMetadata({ params: Promise.resolve({ slug: "elina" }), searchParams: Promise.resolve({ locale: "ko", share: "jjinfan" }) });
      expect(JSON.stringify(shared.openGraph)).toContain("https://kyaa.io/share/jjinfan/elina?locale=ko&n=47");
      expect(shared.title).toBe("찐팬 100명 · 엘리나 | kyaa");
      mocks.challenge.mockClear();
      const plain = await generateMetadata({ params: Promise.resolve({ slug: "elina" }), searchParams: Promise.resolve({ locale: "ko" }) });
      expect(mocks.challenge).not.toHaveBeenCalled();
      expect(JSON.stringify(plain.openGraph)).not.toContain("/share/jjinfan/");
      mocks.challenge.mockRejectedValueOnce(new Error("db"));
      const failed = await generateMetadata({ params: Promise.resolve({ slug: "elina" }), searchParams: Promise.resolve({ locale: "ko", share: "jjinfan" }) });
      expect(failed.title).toBe("엘리나 | kyaa");
    } finally { Object.assign(mocks, { creator: before }); }
  });
});

it("sends an old leaderboard link to the fans tab when fan pages use the group layout, and leaves it alone otherwise", async () => {
  const before = process.env.KYAA_GROUPS_ENABLED;
  try {
    process.env.KYAA_GROUPS_ENABLED = "true";
    await expect(CelebrityPage({ params: Promise.resolve({ slug: "runmusic" }), searchParams: Promise.resolve({ locale: "en", tab: "leaderboard" }) })).rejects.toThrow("redirect:/runmusic?tab=members&locale=en");
    process.env.KYAA_GROUPS_ENABLED = "false";
    mocks.redirect.mockClear();
    await CelebrityPage({ params: Promise.resolve({ slug: "runmusic" }), searchParams: Promise.resolve({ locale: "en", tab: "leaderboard" }) });
    expect(mocks.redirect).not.toHaveBeenCalled();
  } finally { process.env.KYAA_GROUPS_ENABLED = before; }
});

it("passes the 찐팬 100 flag from the server so a direct ?challenge= link opens nothing while the challenge is off", async () => {
  const keys = ["KYAA_FEATURE_JJINFAN_GAUGE", "BYUS_DATA_ENVIRONMENT"] as const;
  const before = keys.map(key => process.env[key]);
  const enabled = async () => (await CelebrityPage({ params: Promise.resolve({ slug: "runmusic" }), searchParams: Promise.resolve({ locale: "ko" }) })).props.children.props.jjinfanChallengeEnabled;
  try {
    delete process.env.KYAA_FEATURE_JJINFAN_GAUGE; process.env.BYUS_DATA_ENVIRONMENT = "production";
    expect(await enabled()).toBe(false);
    process.env.KYAA_FEATURE_JJINFAN_GAUGE = "false"; process.env.BYUS_DATA_ENVIRONMENT = "development";
    expect(await enabled()).toBe(false);
    delete process.env.KYAA_FEATURE_JJINFAN_GAUGE;
    expect(await enabled()).toBe(true);
    process.env.KYAA_FEATURE_JJINFAN_GAUGE = "true"; process.env.BYUS_DATA_ENVIRONMENT = "production";
    expect(await enabled()).toBe(true);
  } finally { keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; }); }
});
