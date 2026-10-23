import "server-only";
import { createClient } from "@/server/data/client";
import { creatorHomeHref, isCreatorHandle } from "@/features/creator/domain/creator-navigation";
import { raffleListSchema } from "@/features/benefit/domain/raffle";
import { canonicalUrl, isRehearsalPath, type SeoLocale } from "@/seo/metadata";
import { createPublicImageRoleReader } from "../media/public-image-reader";

export type IndexablePage = { path: string; locale: SeoLocale };
export type PublicationPage = IndexablePage & { content: unknown };

type QueryResult = { data: unknown; error: unknown; count?: number | null };
interface PublicQuery {
  range(start: number, end: number): PromiseLike<QueryResult>;
}

// Advance by received rows as PostgREST's row cap may be smaller than our page size.
async function readAll<T>(query: () => PublicQuery, name: string): Promise<T[]> {
  const rows: T[] = [];
  let expectedCount: number | undefined;
  for (;;) {
    const { data, error, count } = await query().range(rows.length, rows.length + 499);
    if (error || !Array.isArray(data) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error(`Sitemap ${name} query failed`);
    expectedCount ??= count;
    if (count !== expectedCount || rows.length + data.length > count || (!data.length && rows.length < count)) throw new Error(`Sitemap ${name} query incomplete`);
    rows.push(...data as T[]);
    if (rows.length === count) return rows;
  }
}

type Creator = { slug: string; locale: "ko" | "en" } & Record<string, unknown>;
type Parent = { slug: string; status: string; archived_at: string | null; [key: string]: unknown };
type Live = { id: string; slug: string; live_type: string; brand_id: string | null; celebrities: Parent | Parent[]; brands: Parent | Parent[] | null } & Record<string, unknown>;
type Benefit = { id: string; benefit_localizations: unknown[] } & Record<string, unknown>;
function first<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

/** One complete, fail-closed public projection for discovery and change notifications. */
export async function loadPublicationContent(): Promise<PublicationPage[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if ((!url || !key) && (!process.env.POSTGREST_URL || !process.env.POSTGREST_SERVICE_TOKEN)) throw new Error("Sitemap content is not configured");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [activeCreators, overrides, previews] = await Promise.all([
    readAll<{ slug: string }>(() => client.from("celebrities").select("slug", { count: "exact" }).eq("status", "published").is("archived_at", null).order("slug"), "creator"),
    readAll<{ live_event_id: string } & Record<string, unknown>>(() => client.from("live_status_overrides")
      .select("id,live_event_id,effective_status,effective_from,effective_until,created_at,live_events!inner(publication_status,archived_at)", { count: "exact" })
      .eq("live_events.publication_status", "published").is("live_events.archived_at", null).order("id"), "LIVE override"),
    readAll<{ live_event_id: string } & Record<string, unknown>>(() => client.from("live_event_previews")
      .select("live_event_id,kind,duration_ms,square_video_url,square_poster_url,landscape_video_url,landscape_poster_url,live_events!inner(publication_status,archived_at)", { count: "exact" })
      .eq("publication_status", "published").is("archived_at", null)
      .eq("live_events.publication_status", "published").is("live_events.archived_at", null).order("live_event_id"), "LIVE preview"),
  ]);
  const active = new Set(activeCreators.map(row => row.slug));
  const images = createPublicImageRoleReader({ url, serviceRoleKey: key }, client);
  const locales = await Promise.all((["ko", "en"] as const).map(async locale => {
    const [creatorRows, liveRows, benefits] = await Promise.all([
      readAll<Creator>(() => client.from("published_celebrities")
        .select("slug,locale,name,summary,image_url,image_alt,image_position,themes,social_links,display_order,primary_role,website_url,ticket_url", { count: "exact" })
        .eq("locale", locale).order("slug"), "creator"),
      readAll<Live>(() => client.from("live_events")
        .select("id,slug,live_type,brand_id,content_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,live_provider,external_live_url,youtube_url,approved_hero_url,replay_provider,replay_url,replay_published,live_event_localizations!inner(locale,title,summary,hero_alt),celebrities!inner(slug,status,archived_at,image_url,image_position,celebrity_localizations!inner(locale,name)),brands(slug,status,archived_at,logo_url,website_url,brand_localizations!inner(locale,name,description))", { count: "exact" })
        .eq("publication_status", "published").is("archived_at", null)
        .eq("live_event_localizations.locale", locale)
        .eq("celebrities.status", "published").is("celebrities.archived_at", null).eq("celebrities.celebrity_localizations.locale", locale)
        .eq("brands.status", "published").is("brands.archived_at", null).eq("brands.brand_localizations.locale", locale)
        .order("slug"), "LIVE"),
      readAll<Benefit>(() => client.from("benefits")
        .select("id,slug,claim_opens_at,claim_closes_at,minimum_score,minimum_level,required_stamp_type,required_activity_type,delivery_type,allocation_mode,benefit_localizations!inner(locale,title,summary,eligibility_label,delivery_label),celebrities!inner(slug,status,archived_at)", { count: "exact" })
        .eq("publication_status", "published").is("archived_at", null)
        .eq("celebrities.status", "published").is("celebrities.archived_at", null)
        .eq("benefit_localizations.locale", locale).order("id"), "benefit"),
    ]);
    const creators = creatorRows.filter(row => active.has(row.slug) && isCreatorHandle(row.slug) && !isRehearsalPath(creatorHomeHref(row.slug)));
    const lives = liveRows.filter(row => {
      const brand = first(row.brands);
      return !isRehearsalPath(`/live/${row.slug}`) && ((row.live_type === "recurring" && row.brand_id === null) || (brand != null && brand.status === "published" && brand.archived_at === null));
    });
    const [creatorPhotos, livePhotos] = await Promise.all([
      images.readCelebrityPhotoSetsBySlug(creators.map(row => row.slug)),
      images.readLivePhotoSetsBySlug(lives.map(row => row.slug)),
    ]);
    const publicLives = lives.map(live => ({ ...live, photos: livePhotos[live.slug] ?? null, overrides: overrides.filter(row => row.live_event_id === live.id), previews: previews.filter(row => row.live_event_id === live.id) }));
    const benefitById = new Map(benefits.map(row => [row.id, row]));
    const pages: PublicationPage[] = [];
    // The public RPC owns teaser/fallback/parent visibility and public policy bodies.
    // A fixed clock prevents status transitions alone from changing the fingerprint.
    for (const creator of creators) {
      const { data, error } = await client.rpc("get_public_raffles", { p_celebrity_slug: creator.slug, p_locale: locale, p_now: "2000-01-01T00:00:00.000Z" });
      if (error) throw new Error("Sitemap raffle query failed");
      const raffles = raffleListSchema.parse(data).raffles.map(({ status, ...raffle }) => ({ ...raffle, cancelled: status === "cancelled" }));
      const parent = { ...creator, photos: creatorPhotos[creator.slug] ?? null };
      const catalog = { parent, raffles };
      pages.push({ path: creatorHomeHref(creator.slug), locale, content: { ...catalog, lives: publicLives.filter(row => first(row.celebrities)?.slug === creator.slug) } });
      pages.push({ path: `/c/${creator.slug}/raffles`, locale, content: catalog });
      for (const raffle of raffles) {
        const benefit = raffle.benefitId ? benefitById.get(raffle.benefitId) : null;
        // The RPC pairs published campaigns with published benefits, and teasers
        // with draft benefits; only the former can pass the public detail read.
        if (!benefit) continue;
        pages.push({ path: `/c/${creator.slug}/raffles/${benefit.id}`, locale, content: { ...catalog, benefit } });
      }
    }
    for (const live of publicLives) pages.push({ path: `/live/${live.slug}`, locale, content: live });
    return pages;
  }));
  return locales.flat();
}

export async function loadSitemapContent(): Promise<IndexablePage[]> {
  return (await loadPublicationContent()).map(({ path, locale }) => ({ path, locale }));
}

export function publicationContentByUrl(pages: readonly PublicationPage[]): Map<string, unknown> {
  return new Map(pages.map(page => [canonicalUrl(page.path, page.locale), page.content]));
}
