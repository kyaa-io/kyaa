import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { from, rpc, imageReads } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), imageReads: vi.fn().mockResolvedValue({}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from, rpc }) }));
vi.mock("../media/public-image-reader", () => ({ createPublicImageRoleReader: () => ({ readCelebrityPhotoSetsBySlug: imageReads, readLivePhotoSetsBySlug: imageReads }) }));
import { loadSearchPublicationSnapshot } from "./publication-snapshot";
import { loadSitemapContent, loadPublicationContent } from "./sitemap-content";
import { buildSitemap } from "@/seo/sitemap";

let body = "Public delivery instructions";
let removed = false;
let failed = false;
let hiddenCreator = false;
let draftCampaign = false;
let draftBenefit = false;
let liveRows: Record<string, unknown>[] = [];
const id = "11111111-1111-4111-8111-111111111111";
const queries: { relation: string; columns: string; filters: Record<string, unknown>; start?: number }[] = [];
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  body = "Public delivery instructions"; removed = false; failed = false; hiddenCreator = false; draftCampaign = false; draftBenefit = false; liveRows = []; queries.length = 0;
  rpc.mockImplementation(async () => ({ data: { raffles: [{ id: "22222222-2222-4222-8222-222222222222", benefitId: id, title: "Gift", summary: "Gift summary", imageUrl: null, winnerQuantity: 1, status: "preparing", entryOpensAt: "2026-10-01T00:00:00Z", entryClosesAt: "2026-11-01T00:00:00Z", fulfillmentMethod: "digital", perFanTicketLimit: null }] }, error: null }));
  from.mockImplementation((relation: string) => {
    const read = { relation, columns: "", filters: {} as Record<string, unknown>, start: 0 };
    queries.push(read);
    const query = {
      select(columns: string) { read.columns = columns; return query; },
      eq(key: string, value: unknown) { read.filters[key] = value; return query; },
      is(key: string, value: unknown) { read.filters[key] = value; return query; },
      order() { return query; },
      async range(start: number) {
        read.start = start;
        if (failed && relation === "benefits") return { data: null, error: { message: "offline" } };
        if (start > 0) return { data: [], error: null };
        const locale = read.filters.locale;
        const data: Record<string, unknown[]> = {
          celebrities: hiddenCreator ? [] : [{ id: "creator", slug: "artist" }],
          published_celebrities: [{ slug: "artist", locale, name: "Artist", summary: "Public creator", image_url: "image.jpg" }],
          live_events: liveRows,
          benefits: removed || draftBenefit || draftCampaign || read.filters["benefit_localizations.locale"] === "en" ? [] : [{ id, slug: "gift", celebrity_id: "creator", publication_status: "published", benefit_localizations: [{ locale: "ko", title: "Gift", summary: "Gift summary", delivery_label: body }] }],
          benefit_draw_publications: [], live_status_overrides: [], live_event_previews: [], raffle_fulfillment_policies: [],
        };
        return { data: data[relation] ?? [], count: (data[relation] ?? []).length, error: null };
      },
    }; return query;
  });
});

it("shares the complete sitemap URL set and requires a localized public benefit for details", async () => {
  const content = await loadSitemapContent();
  expect(content).toContainEqual({ path: "/c/artist/raffles", locale: "en" });
  expect(content).toContainEqual({ path: `/c/artist/raffles/${id}`, locale: "ko" });
  expect(content).not.toContainEqual({ path: `/c/artist/raffles/${id}`, locale: "en" });
  const snapshot = await loadSearchPublicationSnapshot();
  expect(Object.keys(snapshot).sort()).toEqual(buildSitemap(content).map(page => page.url).sort());
  expect(Object.values(snapshot).every(value => /^[a-f0-9]{64}$/.test(value))).toBe(true);
});

it("tracks public body edits and removals, excluding time and private state", async () => {
  const before = await loadSearchPublicationSnapshot();
  body = "Updated public instructions";
  const after = await loadSearchPublicationSnapshot();
  const url = `https://kyaa.io/c/artist/raffles/${id}?locale=ko`;
  expect(after[url]).not.toBe(before[url]);
  expect(await loadSearchPublicationSnapshot()).toEqual(after);
  removed = true;
  expect((await loadSearchPublicationSnapshot())[url]).toBeUndefined();
  expect(queries.every(read => !/\*|fan_count|recipient|app_user|secret|delivery_value/.test(read.columns))).toBe(true);
});

it("rejects the whole snapshot on a failed later query", async () => {
  failed = true;
  await expect(loadSearchPublicationSnapshot()).rejects.toThrow();
});

it("omits archived/hidden creators even when an old discovery view row remains", async () => {
  hiddenCreator = true;
  const snapshot = await loadSearchPublicationSnapshot();
  expect(Object.keys(snapshot).some(url => /artist/.test(url))).toBe(false);
});

it.each(["campaign", "benefit"])("keeps a teaser catalog but excludes draft %s detail", async (kind) => {
  draftCampaign = kind === "campaign";
  draftBenefit = kind === "benefit";
  const snapshot = await loadSearchPublicationSnapshot();
  expect(snapshot["https://kyaa.io/c/artist/raffles?locale=ko"]).toBeDefined();
  expect(snapshot[`https://kyaa.io/c/artist/raffles/${id}?locale=ko`]).toBeUndefined();
});

it("preserves the RPC's slug fallback in a translated catalog without inventing a detail translation", async () => {
  rpc.mockImplementation(async (_name: string, args: { p_locale: string }) => ({ data: { raffles: [{ id: "22222222-2222-4222-8222-222222222222", benefitId: id, title: args.p_locale === "en" ? "gift-slug" : "선물", summary: "Public summary", imageUrl: null, winnerQuantity: 1, status: "preparing", entryOpensAt: null, entryClosesAt: null, fulfillmentMethod: "digital", perFanTicketLimit: null }] }, error: null }));
  const pages = await loadPublicationContent();
  expect(pages.find(page => page.path === "/c/artist/raffles" && page.locale === "en")?.content).toMatchObject({ raffles: [{ title: "gift-slug" }] });
  expect(pages.some(page => page.path.endsWith(id) && page.locale === "en")).toBe(false);
});

it("excludes rehearsal and missing public brand parents while retaining brandless recurring LIVE", async () => {
  const celebrity = { slug: "artist", status: "published", archived_at: null };
  liveRows = [
    { id: "rehearsal", slug: "artist-rehearsal", live_type: "recurring", brand_id: null, brands: null, celebrities: celebrity },
    { id: "hidden", slug: "hidden-brand-event", live_type: "general", brand_id: "brand", brands: null, celebrities: celebrity },
    { id: "recurring", slug: "recurring-event", live_type: "recurring", brand_id: null, brands: null, celebrities: celebrity },
  ];
  const snapshot = await loadSearchPublicationSnapshot();
  expect(Object.keys(snapshot).some(url => /rehearsal|hidden-brand-event/.test(url))).toBe(false);
  expect(snapshot["https://kyaa.io/live/recurring-event?locale=ko"]).toBeDefined();
});

it("tracks static copy by deployment version and stable public directory changes", async () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "first-deployment");
  const before = await loadSearchPublicationSnapshot();
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "second-deployment");
  const after = await loadSearchPublicationSnapshot();
  expect(after["https://kyaa.io/guide?locale=ko"]).not.toBe(before["https://kyaa.io/guide?locale=ko"]);
  expect(after["https://kyaa.io/artist?locale=ko"]).toBe(before["https://kyaa.io/artist?locale=ko"]);
  body = "Changed delivery instructions";
  expect((await loadSearchPublicationSnapshot())["https://kyaa.io/?locale=ko"]).not.toBe(after["https://kyaa.io/?locale=ko"]);
});

it("rejects public RPC failure and invalid public payloads", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  await expect(loadSearchPublicationSnapshot()).rejects.toThrow("Sitemap raffle query failed");
  rpc.mockResolvedValue({ data: { raffles: [{ private: "invalid" }] }, error: null });
  await expect(loadSearchPublicationSnapshot()).rejects.toThrow();
});

it("does not change hashes when only RPC clock-derived status changes", async () => {
  const before = await loadSearchPublicationSnapshot();
  const implementation = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (...args: unknown[]) => {
    const result = await implementation(...args);
    result.data.raffles[0].status = "closed";
    return result;
  });
  expect(await loadSearchPublicationSnapshot()).toEqual(before);
});

it("tracks LIVE schedule and parent text changes in the event and creator projection", async () => {
  const celebrity = { slug: "artist", status: "published", archived_at: null, celebrity_localizations: [{ locale: "ko", name: "Artist" }] };
  liveRows = [{ id: "recurring", slug: "recurring-event", live_type: "recurring", brand_id: null, brands: null, celebrities: celebrity, starts_at: "2026-10-01T00:00:00Z" }];
  const before = await loadSearchPublicationSnapshot();
  liveRows[0].starts_at = "2026-10-02T00:00:00Z";
  const schedule = await loadSearchPublicationSnapshot();
  expect(schedule["https://kyaa.io/live/recurring-event?locale=ko"]).not.toBe(before["https://kyaa.io/live/recurring-event?locale=ko"]);
  expect(schedule["https://kyaa.io/artist?locale=ko"]).not.toBe(before["https://kyaa.io/artist?locale=ko"]);
  celebrity.celebrity_localizations[0].name = "Updated artist";
  expect((await loadSearchPublicationSnapshot())["https://kyaa.io/live/recurring-event?locale=ko"]).not.toBe(schedule["https://kyaa.io/live/recurring-event?locale=ko"]);
});
