import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from }) }));
vi.mock("../media/public-image-reader", () => ({ createPublicImageRoleReader: () => ({ readCelebrityPhotoSetsBySlug: async () => ({}), readLivePhotoSetsBySlug: async () => ({}) }) }));
import { loadSitemapContent } from "./sitemap-content";

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  from.mockReset();
});

it("paginates even below the requested page size and filters archived parents and exact translations", async () => {
  const reads: { relation: string; columns: string; filters: Record<string, unknown>; ranges: number[][] }[] = [];
  from.mockImplementation((relation: string) => {
    const read = { relation, columns: "", filters: {} as Record<string, unknown>, ranges: [] as number[][] };
    reads.push(read);
    const query = {
      select(columns: string) { read.columns = columns; return query; },
      eq(key: string, value: unknown) { read.filters[key] = value; return query; },
      is(key: string, value: unknown) { read.filters[key] = value; return query; },
      order() { return query; },
      async range(start: number, end: number) {
        read.ranges.push([start, end]);
        return { data: relation === "published_celebrities" ? [{ slug: `inactive-${start}` }] : [], count: relation === "published_celebrities" ? 2 : 0, error: null };
      },
    }; return query;
  });
  expect(await loadSitemapContent()).toEqual([]);
  expect(reads.filter(read => read.relation === "published_celebrities").map(read => read.ranges[0][0])).toEqual([0, 0, 1, 1]);
  expect(reads.find(read => read.relation === "celebrities")?.filters).toMatchObject({ status: "published", archived_at: null });
  for (const read of reads.filter(read => read.relation === "live_events")) {
    expect(read.columns).not.toMatch(/viewer|reservation_id|recipient|fan_count/);
    expect(read.filters).toMatchObject({ publication_status: "published", archived_at: null, "celebrities.status": "published", "celebrities.archived_at": null, "brands.status": "published", "brands.archived_at": null });
    const locale = read.filters["live_event_localizations.locale"];
    expect(read.filters["celebrities.celebrity_localizations.locale"]).toBe(locale);
    expect(read.filters["brands.brand_localizations.locale"]).toBe(locale);
  }
  for (const read of reads.filter(read => read.relation === "benefits")) {
    expect(read.filters).toMatchObject({ publication_status: "published", archived_at: null, "celebrities.status": "published", "celebrities.archived_at": null });
    expect(["ko", "en"]).toContain(read.filters["benefit_localizations.locale"]);
  }
});

it("fails closed instead of returning partial content", async () => {
  const query = { select: () => query, eq: () => query, is: () => query, order: () => query, range: async () => ({ data: null, error: { message: "unavailable" } }) };
  from.mockReturnValue(query);
  await expect(loadSitemapContent()).rejects.toThrow("Sitemap creator query failed");
});

it("rejects a truncated read rather than interpreting it as removals", async () => {
  const query = { select: () => query, eq: () => query, is: () => query, order: () => query, range: async () => ({ data: [], count: 1, error: null }) };
  from.mockReturnValue(query);
  await expect(loadSitemapContent()).rejects.toThrow("query incomplete");
});
