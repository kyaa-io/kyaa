import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PublishedCelebrity } from "../../../../server/content/content-domain";
import { createCachedTikTokLiveObserver } from "../../../../server/tiktok/cached-tiktok-live-source";
import { createSharedLiveFeed } from "../../../../server/tiktok/shared-live-feed";
import { createGetObservedLiveNow } from "./route";

/** G3: HOSTING_PROVIDER=aws에서 `hostingCache`가 꺼져도 live-now가 외부 관측을 증폭하지 않는다. */
const baseTime = Date.parse("2026-11-12T03:00:00.000Z");

function celebrity(slug: string): PublishedCelebrity {
  return {
    slug,
    locale: "ko",
    name: slug,
    summary: "공개 소개",
    image: { url: `/${slug}.jpg`, alt: slug, position: "center" },
    roles: ["creator"],
    themes: [],
    socialLinks: [{ platform: "tiktok", url: `https://www.tiktok.com/@${slug}` }],
    displayOrder: 0,
    fanCount: 0,
  };
}

const slugs = ["alpha", "bravo", "charlie", "delta"];

function harness(options: { sourceDelayMs?: number; unlisted?: () => ReadonlySet<string> } = {}) {
  let clock = baseTime;
  const source = vi.fn(async (handle: string) => {
    if (options.sourceDelayMs) await new Promise((resolve) => setTimeout(resolve, options.sourceDelayMs));
    return { state: "offline" as const, observedAt: new Date(clock).toISOString(), handle };
  });
  const observe = createCachedTikTokLiveObserver({ source: source as never, now: () => new Date(clock) });
  const list = vi.fn(async () => slugs.map(celebrity));
  const listUnlistedSlugs = vi.fn(async () => options.unlisted?.() ?? new Set<string>());
  const captureLiveStarts = vi.fn(async () => undefined);
  const handler = createGetObservedLiveNow({
    repository: { list, listUnlistedSlugs },
    observe,
    captureLiveStarts,
    now: () => new Date(clock),
    shareFeed: createSharedLiveFeed({ clock: () => clock }),
  });
  const request = () => handler(new Request("https://kyaa.test/api/public/live-now?locale=ko&v=4"));
  return { source, list, listUnlistedSlugs, captureLiveStarts, request, advance: (ms: number) => { clock += ms; } };
}

describe("live-now on AWS hosting", () => {
  beforeEach(() => { vi.stubEnv("HOSTING_PROVIDER", "aws"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("serves 20 concurrent requests with one observation per handle, one list read and one capture", async () => {
    const h = harness();
    const responses = await Promise.all(Array.from({ length: 20 }, () => h.request()));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(h.source).toHaveBeenCalledTimes(slugs.length);
    for (const slug of slugs) expect(h.source.mock.calls.filter(([handle]) => handle === slug)).toHaveLength(1);
    expect(h.list).toHaveBeenCalledTimes(1);
    expect(h.captureLiveStarts).toHaveBeenCalledTimes(1);
  });

  it("reuses the result for 15 seconds, then looks again once", async () => {
    const h = harness();
    await h.request();
    h.advance(14_000);
    await h.request();
    expect(h.source).toHaveBeenCalledTimes(slugs.length);
    expect(h.captureLiveStarts).toHaveBeenCalledTimes(1);
    h.advance(1_500);
    await Promise.all([h.request(), h.request(), h.request()]);
    expect(h.source).toHaveBeenCalledTimes(slugs.length * 2);
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(h.captureLiveStarts).toHaveBeenCalledTimes(2);
  });

  it("applies the unlisted filter on every request while the feed is shared", async () => {
    let hidden = new Set<string>();
    const h = harness({ unlisted: () => hidden });
    const first = await (await h.request()).json() as { targets: Array<{ celebritySlug: string }> };
    expect(first.targets.map((target) => target.celebritySlug)).toContain("bravo");
    hidden = new Set(["bravo"]);
    const second = await (await h.request()).json() as { targets: Array<{ celebritySlug: string }> };
    expect(second.targets.map((target) => target.celebritySlug)).not.toContain("bravo");
    expect(h.list).toHaveBeenCalledTimes(1);
    expect(h.listUnlistedSlugs).toHaveBeenCalledTimes(2);
  });

  it("answers within 9 seconds even when the upstream is slow", async () => {
    vi.useFakeTimers();
    const h = harness({ sourceDelayMs: 60_000 });
    const pending = Promise.all(Array.from({ length: 20 }, () => h.request()));
    await vi.advanceTimersByTimeAsync(9_000);
    const responses = await pending;
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(h.list).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failed build", async () => {
    const h = harness();
    h.list.mockRejectedValueOnce(new Error("db down"));
    expect((await h.request()).status).toBe(503);
    expect((await h.request()).status).toBe(200);
    expect(h.list).toHaveBeenCalledTimes(2);
  });
});
