import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/data/client", () => ({ createClient: () => database }));
import { createLiveEventRepositoryFromEnvironment } from "./live-event-repository";

const now = new Date("2026-11-01T00:00:00Z");
const ended = { slug: "ended", created_at: "2026-10-01T00:00:00Z", content_status: "scheduled", starts_at: "2026-10-02T00:00:00Z", ends_at: "2026-10-02T01:00:00Z", live_status_overrides: [] };
const active = { effective_status: "live", effective_from: "2026-10-31T00:00:00Z", effective_until: "2026-11-02T00:00:00Z", created_at: "2026-10-31T00:00:00Z" };
const rows = [
  ...Array.from({ length: 30 }, (_, i) => ({ ...ended, slug: `ended-${i}` })),
  { ...ended, slug: "upcoming", starts_at: "2026-11-02T00:00:00Z", ends_at: null },
  { ...ended, slug: "manual-live", live_status_overrides: [active] },
  { ...ended, slug: "expired-override", live_status_overrides: [{ ...active, effective_until: now.toISOString() }] },
  { ...ended, slug: "cancelled", content_status: "cancelled", live_status_overrides: [active] },
  { ...ended, slug: "unknown-end-history", ends_at: null },
];
const lookups: string[] = [];
beforeEach(() => {
  lookups.length = 0;
  database.from.mockReset().mockImplementation(() => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key, value) => { if (key === "slug") lookups.push(value); return query; }),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return query;
  });
});
const repository = () => createLiveEventRepositoryFromEnvironment({ url: undefined, serviceRoleKey: undefined });

it("only expands upcoming and currently overridden LIVE rows for the home page", async () => {
  await repository().listFeaturedPublished({ locale: "en", now });
  expect(lookups).toEqual(["upcoming", "manual-live"]);
  expect(database.from).toHaveBeenCalledTimes(3);
  expect(database.from.mock.results[0].value.select).toHaveBeenCalledWith(expect.stringContaining("live_status_overrides("));
});

describe("full catalog", () => {
  const row = { id: "e1000000-0000-4000-8000-000000000001", slug: "visible", live_type: "recurring", celebrity_id: "c1000000-0000-4000-8000-000000000001", brand_id: null, content_status: "scheduled", starts_at: "2026-11-02T00:00:00Z", ends_at: null, attendance_valid_from: null, attendance_valid_until: null, reservation_opens_at: "2026-10-01T00:00:00Z", reservation_closes_at: "2026-11-02T00:00:00Z", live_provider: "youtube", external_live_url: "https://www.youtube.com/watch?v=abc_DEF-1", youtube_url: "https://www.youtube.com/watch?v=abc_DEF-1", approved_hero_url: "/hero.webp", replay_provider: null, replay_url: null, replay_published: false,
    live_event_localizations: [{ title: "제목", summary: "요약", hero_alt: "대체" }], celebrity: { id: "c1000000-0000-4000-8000-000000000001", slug: "elina", image_url: "/c.webp", image_position: "50% 50%", fan_count: 1, celebrity_localizations: [{ name: "엘리나" }] }, brand: null, live_status_overrides: [], live_event_previews: null };
  const reads: { table: string; filters: unknown[][] }[] = [];
  const stub = (data: unknown[]) => {
    reads.length = 0;
    database.rpc.mockReset().mockResolvedValue({ data: [], error: null });
    database.from.mockReset().mockImplementation((table: string) => {
      const read = { table, filters: [] as unknown[][] }; reads.push(read);
      const query: Record<string, unknown> = { then: (done: (value: unknown) => unknown) => Promise.resolve({ data: table === "live_events" ? data : [], error: null }).then(done) };
      for (const method of ["select", "eq", "neq", "is", "in", "lte", "gt", "order"]) query[method] = (...args: unknown[]) => { read.filters.push([method, ...args]); return query; };
      return query;
    });
  };
  const eventRead = () => reads.find(({ table }) => table === "live_events")!;
  const liveRows = (rows_: unknown[]) => { stub(rows_); return repository().listPublishedCatalog({ locale: "ko", now, appUserId: null }); };

  it("reads every event once and hides the Wave page from the public list", async () => {
    const { upcoming } = await liveRows([row, { ...row, id: "e2000000-0000-4000-8000-000000000002", slug: "second" }]);
    expect(upcoming.map(({ live }) => live.slug)).toEqual(["second", "visible"]);
    expect(reads.filter(({ table }) => table === "live_events")).toHaveLength(1);
    expect(eventRead().filters).toContainEqual(["neq", "celebrity.slug", "kyaa-wave-fanpage"]);
  });

  it("pushes the creator and every visibility rule into the query", async () => {
    stub([row]);
    await repository().listPublishedCatalog({ creatorSlug: "elina", locale: "ko", now, appUserId: null });
    expect(eventRead().filters).toEqual(expect.arrayContaining([
      ["eq", "publication_status", "published"], ["eq", "celebrity.slug", "elina"], ["eq", "celebrity.status", "published"], ["eq", "brand.status", "published"],
      ["eq", "live_event_localizations.locale", "ko"], ["eq", "celebrity.celebrity_localizations.locale", "ko"], ["eq", "brand.brand_localizations.locale", "ko"],
      ["eq", "live_event_previews.publication_status", "published"], ["is", "live_event_previews.archived_at", null],
    ]));
  });

  it.each([
    ["no event localization", { live_event_localizations: [] }],
    ["an unpublished creator", { celebrity: null }],
    ["a creator without this language", { celebrity: { ...row.celebrity, celebrity_localizations: [] } }],
    ["a required brand hidden by its filter", { live_type: "general", brand_id: "b1", brand: null }],
  ])("drops an event with %s", async (_name, patch) => {
    expect((await liveRows([{ ...row, ...patch }])).upcoming).toEqual([]);
  });

  it("keeps a recurring event that has no brand", async () => {
    expect((await liveRows([row])).upcoming[0]?.live.brand).toBeNull();
  });
});
