import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({ from: vi.fn() }));
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

it("still expands history for the full catalog", async () => {
  await repository().listPublishedCatalog({ locale: "en", now, appUserId: null });
  expect(lookups).toEqual(rows.map(row => row.slug));
  expect(database.from).toHaveBeenCalledTimes(rows.length + 1);
});
