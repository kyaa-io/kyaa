import "server-only";
import { isRecordedReplayUrl } from "../../features/live/domain/live-watch-link";
import { ifewEndedDescription, ifewLiveSlug } from "../../features/live/domain/ifew-event";

import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";

import {
  deriveEffectiveLiveStatus,
  deriveLivePrimaryAction,
  liveEventResponseSchema,
  parseExternalLiveUrl,
  type EffectiveLiveStatus,
  type ExternalLiveProvider,
  type LiveEventResponse,
  type LiveLocale,
  type LiveReservationSummary,
  type LiveStatusOverride,
  type LiveViewer,
} from "../../features/live/domain/live-event";
import { createPublicImageRoleReader, type PublicImageRoleReader } from "../media/public-image-reader";

export interface LiveEventRepository {
  listFeaturedPublished(input: {
    locale: LiveLocale;
    now: Date;
  }): Promise<readonly LiveEventResponse[]>;
  listPublishedCatalog(input: {
    creatorSlug?: string;
    locale: LiveLocale;
    appUserId: string | null;
    now: Date;
  }): Promise<{
    liveNow: readonly LiveEventResponse[];
    upcoming: readonly LiveEventResponse[];
    replay: readonly LiveEventResponse[];
  }>;
  findPublishedBySlug(input: {
    slug: string;
    locale: LiveLocale;
    appUserId: string | null;
    now: Date;
  }): Promise<LiveEventResponse | null>;
}

export interface LiveEventRecord {
  id: string;
  slug: string;
  liveType?: "general" | "recurring";
  attendanceConfigured?: boolean;
  attendanceWindow?: { opensAt: string; closesAt: string } | null;
  sourceStatus: EffectiveLiveStatus;
  startsAt: string;
  endsAt: string | null;
  reservationOpensAt: string;
  reservationClosesAt: string;
  liveProvider: ExternalLiveProvider;
  externalLiveUrl: string;
  youtubeUrl: string;
  replayProvider?: ExternalLiveProvider | null;
  replayUrl?: string | null;
  replayPublished?: boolean;
  heroUrl: string;
  title: string;
  description: string;
  heroAlt: string;
  celebrity: {
    id: string;
    slug: string;
    name: string;
    image: string;
    imagePosition: string;
    fanCount: number;
  };
  brand: {
    slug: string;
    name: string;
    logo: string;
    websiteUrl: string | null;
    productContext: string;
  } | null;
  overrides: readonly LiveStatusOverride[];
  preview?: {
    kind: "artist_teaser" | "event_highlight";
    durationMs: number;
    landscapeVideoUrl: string;
    landscapePosterUrl: string;
  } | null;
}

export interface LiveViewerRecord {
  hasPassport: boolean;
  reservation: LiveReservationSummary | null;
}

export interface LiveEventDataSource {
  listPublishedSlugs(featuredAt?: Date): Promise<readonly { slug: string; createdAt: string }[]>;
  findPublishedEvent(slug: string, locale: LiveLocale): Promise<LiveEventRecord | null>;
  findViewer(appUserId: string, event: LiveEventRecord): Promise<LiveViewerRecord>;
  findMissionsAvailable?(eventId: string, locale: LiveLocale, now: Date): Promise<boolean>;
  /** One read for every published event a catalog may show. Applies the same visibility rules as `findPublishedEvent`. */
  listPublishedEvents(input: { creatorSlug?: string; locale: LiveLocale }): Promise<readonly LiveEventRecord[]>;
  findViewers(appUserId: string, events: readonly LiveEventRecord[]): Promise<ReadonlyMap<string, LiveViewerRecord>>;
  findEventsWithMissions?(locale: LiveLocale, now: Date): Promise<ReadonlySet<string>>;
}

export class DefaultLiveEventRepository implements LiveEventRepository {
  constructor(private readonly source: LiveEventDataSource) {}

  async listFeaturedPublished(input: { locale: LiveLocale; now: Date }): Promise<readonly LiveEventResponse[]> {
    const published = await this.source.listPublishedSlugs(input.now);
    const projected = await Promise.all(
      published.map(async ({ slug, createdAt }) => ({
        createdAt,
        response: await this.findPublishedBySlug({ ...input, slug, appUserId: null }),
      })),
    );

    return projected
      .filter(({ response }) => response?.live.celebrity.slug !== "kyaa-wave-fanpage")
      .filter(
        (item): item is { createdAt: string; response: LiveEventResponse } =>
          item.response?.live.effectiveStatus === "live" ||
          (item.response?.live.effectiveStatus === "scheduled" && Date.parse(item.response.live.startsAt) > input.now.getTime()),
      )
      .sort((left, right) => {
        const statusOrder = (status: EffectiveLiveStatus) => status === "live" ? 0 : 1;
        const statusDifference =
          statusOrder(left.response.live.effectiveStatus) -
          statusOrder(right.response.live.effectiveStatus);
        if (statusDifference !== 0) return statusDifference;
        const startDifference =
          new Date(left.response.live.startsAt).getTime() -
          new Date(right.response.live.startsAt).getTime();
        if (startDifference !== 0) return startDifference;
        const createdDifference =
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        if (createdDifference !== 0) return createdDifference;
        return left.response.live.slug.localeCompare(right.response.live.slug);
      })
      .map(({ response }) => response);
  }

  async listPublishedCatalog(input: {
    creatorSlug?: string;
    locale: LiveLocale;
    appUserId: string | null;
    now: Date;
  }) {
    const records = (await this.source.listPublishedEvents({
      ...(input.creatorSlug ? { creatorSlug: input.creatorSlug } : {}),
      locale: input.locale,
    })).filter(({ celebrity }) => input.creatorSlug ? celebrity.slug === input.creatorSlug : celebrity.slug !== "kyaa-wave-fanpage");
    let eventsWithMissions: ReadonlySet<string> | null = null;
    try {
      eventsWithMissions = await this.source.findEventsWithMissions?.(input.locale, input.now) ?? null;
    } catch { /* A failed auxiliary read must never mean no missions or hide the LIVE. */ }
    const viewers = input.appUserId ? await this.source.findViewers(input.appUserId, records) : null;
    const projected = records.map((record) => this.project(
      record,
      input,
      eventsWithMissions ? eventsWithMissions.has(record.id) : null,
      viewers?.get(record.id) ?? { hasPassport: false, reservation: null },
    ));
    const byStart = (left: LiveEventResponse, right: LiveEventResponse) =>
      Date.parse(left.live.startsAt) - Date.parse(right.live.startsAt) ||
      left.live.slug.localeCompare(right.live.slug);
    const byLatestEnd = (left: LiveEventResponse, right: LiveEventResponse) =>
      Date.parse(right.live.endsAt ?? right.live.startsAt) - Date.parse(left.live.endsAt ?? left.live.startsAt) ||
      left.live.slug.localeCompare(right.live.slug);
    return {
      liveNow: projected.filter(({ live }) => live.effectiveStatus === "live").sort(byStart),
      upcoming: projected.filter(({ live }) => live.effectiveStatus === "scheduled" && Date.parse(live.startsAt) > input.now.getTime()).sort(byStart),
      replay: projected.filter(({ live }) => live.effectiveStatus === "ended" && live.watch.available).sort(byLatestEnd),
    };
  }

  async findPublishedBySlug(input: {
    slug: string;
    locale: LiveLocale;
    appUserId: string | null;
    now: Date;
  }): Promise<LiveEventResponse | null> {
    const record = await this.source.findPublishedEvent(input.slug, input.locale);
    if (!record) return null;

    let missionsAvailable: boolean | null = null;
    try {
      missionsAvailable = await this.source.findMissionsAvailable?.(record.id, input.locale, input.now) ?? null;
    } catch { /* A failed auxiliary read must never mean no missions or hide the LIVE. */ }

    const owner = input.appUserId
      ? await this.source.findViewer(input.appUserId, record)
      : { hasPassport: false, reservation: null };
    return this.project(record, input, missionsAvailable, owner);
  }

  private project(
    record: LiveEventRecord,
    input: { locale: LiveLocale; appUserId: string | null; now: Date },
    missionsAvailable: boolean | null,
    owner: LiveViewerRecord,
  ): LiveEventResponse {
    const viewer: LiveViewer = {
      authenticated: input.appUserId !== null,
      passport: owner.hasPassport ? "active" : "missing",
      reservation: owner.reservation,
    };
    const effectiveStatus = deriveEffectiveLiveStatus({
      sourceStatus: record.sourceStatus,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      overrides: record.overrides,
      now: input.now,
    });
    const watchUrl = parseExternalLiveUrl(
      record.liveProvider,
      record.externalLiveUrl,
    );
    const replayAvailable = effectiveStatus === "ended" && record.replayPublished === true
      && Boolean(record.replayProvider && record.replayUrl && isRecordedReplayUrl(record.replayProvider, record.replayUrl));
    const response: LiveEventResponse = {
      live: {
        id: record.id,
        liveType: record.liveType ?? "general",
        attendanceConfigured: record.attendanceConfigured ?? true,
        attendanceWindow: record.attendanceWindow ?? null,
        slug: record.slug,
        missionsAvailable,
        effectiveStatus,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        reservationOpensAt: record.reservationOpensAt,
        reservationClosesAt: record.reservationClosesAt,
        title: record.title,
        description: record.slug === ifewLiveSlug && effectiveStatus === "ended"
          ? ifewEndedDescription[input.locale]
          : record.description,
        productContext: record.brand?.productContext ?? null,
        heroImage: { url: record.heroUrl, alt: record.heroAlt },
        celebrity: {
          slug: record.celebrity.slug,
          name: record.celebrity.name,
          image: record.celebrity.image,
          imagePosition: record.celebrity.imagePosition,
          fanCount: record.celebrity.fanCount,
        },
        brand: record.brand ? {
          slug: record.brand.slug,
          name: record.brand.name,
          logo: record.brand.logo,
          websiteUrl: record.brand.websiteUrl,
        } : null,
        watch: {
          available: effectiveStatus === "live" || replayAvailable,
          mode: effectiveStatus === "live" ? "live" : replayAvailable ? "replay" : "unavailable",
          provider: replayAvailable ? record.replayProvider! : record.liveProvider,
          url: replayAvailable ? record.replayUrl! : watchUrl,
        },
        preview: record.preview
          ? {
              kind: record.preview.kind,
              durationMs: record.preview.durationMs,
              landscape: {
                videoUrl: record.preview.landscapeVideoUrl,
                posterUrl: record.preview.landscapePosterUrl,
              },
            }
          : null,
      },
      viewer,
      primaryAction: deriveLivePrimaryAction({
        status: effectiveStatus,
        reservationOpensAt: record.reservationOpensAt,
        reservationClosesAt: record.reservationClosesAt,
        now: input.now,
        viewer,
      }),
    };
    return liveEventResponseSchema.parse(response);
  }
}

async function enrichLiveResponses(
  responses: readonly LiveEventResponse[],
  images: PublicImageRoleReader,
): Promise<readonly LiveEventResponse[]> {
  const [eventPhotosBySlug, creatorPhotosBySlug] = await Promise.all([
    images.readLivePhotoSetsBySlug(responses.map(({ live }) => live.slug)),
    images.readCelebrityPhotoSetsBySlug(
      responses.map(({ live }) => live.celebrity.slug),
    ),
  ]);
  return responses.map((response) => {
    const eventPhotos = eventPhotosBySlug[response.live.slug];
    const creatorPhotos = creatorPhotosBySlug[response.live.celebrity.slug];
    if (eventPhotos === undefined && creatorPhotos === undefined) return response;
    return {
      ...response,
      live: {
        ...response.live,
        ...(eventPhotos === undefined ? {} : { photos: eventPhotos }),
        celebrity: {
          ...response.live.celebrity,
          ...(creatorPhotos === undefined ? {} : { photos: creatorPhotos }),
        },
      },
    };
  });
}

export class PublicImageLiveEventRepository implements LiveEventRepository {
  constructor(
    private readonly repository: LiveEventRepository,
    private readonly images: PublicImageRoleReader,
  ) {}

  async listFeaturedPublished(input: { locale: LiveLocale; now: Date }): Promise<readonly LiveEventResponse[]> {
    return enrichLiveResponses(
      await this.repository.listFeaturedPublished(input),
      this.images,
    );
  }

  async listPublishedCatalog(input: { creatorSlug?: string; locale: LiveLocale; appUserId: string | null; now: Date }) {
    const catalog = await this.repository.listPublishedCatalog(input);
    const all = [...catalog.liveNow, ...catalog.upcoming, ...catalog.replay];
    const enriched = await enrichLiveResponses(all, this.images);
    let offset = 0;
    const take = (count: number) => {
      const items = enriched.slice(offset, offset + count);
      offset += count;
      return items;
    };
    return {
      liveNow: take(catalog.liveNow.length),
      upcoming: take(catalog.upcoming.length),
      replay: take(catalog.replay.length),
    };
  }

  async findPublishedBySlug(input: { slug: string; locale: LiveLocale; appUserId: string | null; now: Date }): Promise<LiveEventResponse | null> {
    const response = await this.repository.findPublishedBySlug(input);
    if (!response) return null;
    return (await enrichLiveResponses([response], this.images))[0] ?? null;
  }
}

type DatabaseClient = Pick<SupabaseClient, "from">;

/** Mirrors the public visibility predicates of get_owned_live_missions, without reading its private payload. */
export async function readPublishedMissionAvailability(database: DatabaseClient, eventId: string, locale: LiveLocale, now: Date): Promise<boolean> {
  const { count, error } = await database.from("live_surveys")
    .select("id,live_survey_localizations!inner(locale)", { count: "exact", head: true })
    .eq("live_event_id", eventId)
    .eq("publication_status", "published")
    .eq("legacy_contract", false)
    .eq("live_survey_localizations.locale", locale)
    .lte("visible_from", now.toISOString())
    .gt("visible_until", now.toISOString());
  if (error || typeof count !== "number") throw new Error("Mission availability lookup failed");
  return count > 0;
}

/** The same public predicates as `readPublishedMissionAvailability`, answered for every event at once. */
export async function readEventsWithPublishedMissions(database: DatabaseClient, locale: LiveLocale, now: Date): Promise<ReadonlySet<string>> {
  const { data, error } = await database.from("live_surveys")
    .select("live_event_id,live_survey_localizations!inner(locale)")
    .eq("publication_status", "published")
    .eq("legacy_contract", false)
    .eq("live_survey_localizations.locale", locale)
    .lte("visible_from", now.toISOString())
    .gt("visible_until", now.toISOString());
  if (error) throw new Error("Mission availability lookup failed");
  return new Set((data ?? []).map((row) => row.live_event_id as string));
}

function onlyRow<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type EventRow = {
  id: string; slug: string; live_type: "general" | "recurring" | null; brand_id: string | null; content_status: EffectiveLiveStatus;
  starts_at: string; ends_at: string | null; attendance_valid_from: string | null; attendance_valid_until: string | null;
  reservation_opens_at: string; reservation_closes_at: string; live_provider: ExternalLiveProvider | null;
  external_live_url: string | null; youtube_url: string; approved_hero_url: string;
  replay_provider: ExternalLiveProvider | null; replay_url: string | null; replay_published: boolean;
};
type LocalizationRow = { title: string; summary: string; hero_alt: string };
type CelebrityRow = { id: string; slug: string; image_url: string; image_position: string; fan_count: number };
type BrandRow = { slug: string; logo_url: string; website_url: string | null };
type OverrideRow = { effective_status: LiveStatusOverride["effectiveStatus"]; effective_from: string; effective_until: string | null; created_at: string };
type PreviewRow = { kind: "artist_teaser" | "event_highlight"; duration_ms: number; landscape_video_url: string; landscape_poster_url: string };
type PublishedEventRow = EventRow & {
  live_event_localizations: LocalizationRow | LocalizationRow[] | null;
  celebrity: (CelebrityRow & { celebrity_localizations: { name: string } | { name: string }[] | null }) | null;
  brand: (BrandRow & { brand_localizations: { name: string; description: string } | { name: string; description: string }[] | null }) | null;
  live_status_overrides: OverrideRow[] | null;
  live_event_previews: PreviewRow | PreviewRow[] | null;
};

function toLiveEventRecord(
  event: EventRow,
  localization: LocalizationRow,
  celebrity: CelebrityRow,
  celebrityLocalization: { name: string },
  brand: (BrandRow & { localization: { name: string; description: string } }) | null,
  overrides: readonly OverrideRow[],
  preview: PreviewRow | null,
): LiveEventRecord {
  return {
    id: event.id,
    slug: event.slug,
    liveType: event.live_type ?? "general",
    attendanceConfigured: event.attendance_valid_from != null && event.attendance_valid_until != null,
    attendanceWindow: event.attendance_valid_from && event.attendance_valid_until
      ? { opensAt: event.attendance_valid_from, closesAt: event.attendance_valid_until }
      : null,
    sourceStatus: event.content_status,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    reservationOpensAt: event.reservation_opens_at,
    reservationClosesAt: event.reservation_closes_at,
    liveProvider: event.live_provider ?? "youtube",
    externalLiveUrl: event.external_live_url ?? event.youtube_url,
    youtubeUrl: event.youtube_url,
    replayProvider: event.replay_provider,
    replayUrl: event.replay_url,
    replayPublished: event.replay_published,
    heroUrl: event.approved_hero_url,
    title: localization.title,
    description: localization.summary,
    heroAlt: localization.hero_alt,
    celebrity: {
      id: celebrity.id,
      slug: celebrity.slug,
      name: celebrityLocalization.name,
      image: celebrity.image_url,
      imagePosition: celebrity.image_position,
      fanCount: celebrity.fan_count,
    },
    brand: brand ? {
      slug: brand.slug,
      name: brand.localization.name,
      logo: brand.logo_url,
      websiteUrl: brand.website_url,
      productContext: brand.localization.description,
    } : null,
    overrides: overrides.map((override) => ({
      effectiveStatus: override.effective_status,
      effectiveFrom: override.effective_from,
      effectiveUntil: override.effective_until,
      createdAt: override.created_at,
    })),
    preview: preview
      ? {
          kind: preview.kind,
          durationMs: preview.duration_ms,
          landscapeVideoUrl: preview.landscape_video_url,
          landscapePosterUrl: preview.landscape_poster_url,
        }
      : null,
  };
}

class SupabaseLiveEventDataSource implements LiveEventDataSource {
  constructor(private readonly database: DatabaseClient) {}

  findMissionsAvailable(eventId: string, locale: LiveLocale, now: Date) {
    return readPublishedMissionAvailability(this.database, eventId, locale, now);
  }

  async listPublishedSlugs(featuredAt?: Date): Promise<readonly { slug: string; createdAt: string }[]> {
    const { data, error } = await this.database
      .from("live_events")
      .select("slug, created_at, content_status, starts_at, ends_at, live_status_overrides(effective_status, effective_from, effective_until, created_at)")
      .eq("publication_status", "published")
      .order("created_at", { ascending: true });
    if (error) throw new Error("Published live list lookup failed");
    // Skip historical detail/mission lookups before the home page fans out.
    const featured = featuredAt ? (data ?? []).filter((event) => {
      const status = deriveEffectiveLiveStatus({
        sourceStatus: event.content_status,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        overrides: (event.live_status_overrides ?? []).map((override) => ({
          effectiveStatus: override.effective_status, effectiveFrom: override.effective_from,
          effectiveUntil: override.effective_until, createdAt: override.created_at,
        })),
        now: featuredAt,
      });
      return status === "live" || (status === "scheduled" && Date.parse(event.starts_at) > featuredAt.getTime());
    }) : data ?? [];
    return featured.map((event) => ({
      slug: event.slug,
      createdAt: event.created_at,
    }));
  }

  async findPublishedEvent(slug: string, locale: LiveLocale): Promise<LiveEventRecord | null> {
    const { data: event, error: eventError } = await this.database
      .from("live_events")
      .select("id, slug, live_type, celebrity_id, brand_id, content_status, starts_at, ends_at, attendance_valid_from, attendance_valid_until, reservation_opens_at, reservation_closes_at, live_provider, external_live_url, youtube_url, approved_hero_url, replay_provider, replay_url, replay_published")
      .eq("slug", slug)
      .eq("publication_status", "published")
      .maybeSingle();
    if (eventError) throw new Error("Published live event lookup failed");
    if (!event) return null;

    const [localizationResult, celebrityResult, brandResult, overridesResult, previewResult] = await Promise.all([
      this.database.from("live_event_localizations").select("title, summary, hero_alt").eq("live_event_id", event.id).eq("locale", locale).maybeSingle(),
      this.database.from("celebrities").select("id, slug, image_url, image_position, fan_count, celebrity_localizations!inner(name)").eq("id", event.celebrity_id).eq("status", "published").eq("celebrity_localizations.locale", locale).maybeSingle(),
      event.brand_id === null && event.live_type === "recurring"
        ? Promise.resolve({ data: null, error: null })
        : this.database.from("brands").select("slug, logo_url, website_url, brand_localizations!inner(name, description)").eq("id", event.brand_id).eq("status", "published").eq("brand_localizations.locale", locale).maybeSingle(),
      this.database.from("live_status_overrides").select("effective_status, effective_from, effective_until, created_at").eq("live_event_id", event.id),
      this.database
        .from("live_event_previews")
        .select("kind, duration_ms, landscape_video_url, landscape_poster_url")
        .eq("live_event_id", event.id)
        .eq("publication_status", "published")
        .is("archived_at", null)
        .maybeSingle(),
    ]);
    if (localizationResult.error || celebrityResult.error || brandResult.error || overridesResult.error || previewResult.error) {
      throw new Error("Published live event projection failed");
    }
    const localization = localizationResult.data;
    const celebrity = celebrityResult.data;
    const brand = brandResult.data;
    const celebrityLocalization = onlyRow(celebrity?.celebrity_localizations ?? null);
    const brandLocalization = onlyRow(brand?.brand_localizations ?? null);
    if (!localization || !celebrity || !celebrityLocalization
      || ((event.live_type !== "recurring" || event.brand_id !== null) && (!brand || !brandLocalization))) {
      return null;
    }

    return toLiveEventRecord(event, localization, celebrity, celebrityLocalization, brand && brandLocalization ? { ...brand, localization: brandLocalization } : null, overridesResult.data ?? [], previewResult.data);
  }

  async listPublishedEvents({ creatorSlug, locale }: { creatorSlug?: string; locale: LiveLocale }): Promise<readonly LiveEventRecord[]> {
    const query = this.database
      .from("live_events")
      .select(`id, slug, live_type, celebrity_id, brand_id, content_status, starts_at, ends_at, attendance_valid_from, attendance_valid_until, reservation_opens_at, reservation_closes_at, live_provider, external_live_url, youtube_url, approved_hero_url, replay_provider, replay_url, replay_published,
        live_event_localizations!inner(title, summary, hero_alt),
        celebrity:celebrities!live_events_celebrity_id_fkey!inner(id, slug, image_url, image_position, fan_count, celebrity_localizations!inner(name)),
        brand:brands!live_events_brand_id_fkey(slug, logo_url, website_url, brand_localizations!inner(name, description)),
        live_status_overrides(effective_status, effective_from, effective_until, created_at),
        live_event_previews(kind, duration_ms, landscape_video_url, landscape_poster_url)`)
      .eq("publication_status", "published")
      .eq("live_event_localizations.locale", locale)
      .eq("celebrity.status", "published")
      .eq("celebrity.celebrity_localizations.locale", locale)
      .eq("brand.status", "published")
      .eq("brand.brand_localizations.locale", locale)
      .eq("live_event_previews.publication_status", "published")
      .is("live_event_previews.archived_at", null);
    const { data, error } = await (creatorSlug
      ? query.eq("celebrity.slug", creatorSlug)
      : query.neq("celebrity.slug", "kyaa-wave-fanpage")
    ).order("created_at", { ascending: true });
    if (error) throw new Error("Published live event projection failed");
    return (data ?? []).flatMap((row) => {
      const event = row as unknown as PublishedEventRow;
      const localization = onlyRow(event.live_event_localizations);
      const celebrity = onlyRow(event.celebrity);
      const brand = onlyRow(event.brand);
      const celebrityLocalization = onlyRow(celebrity?.celebrity_localizations ?? null);
      const brandLocalization = onlyRow(brand?.brand_localizations ?? null);
      if (!localization || !celebrity || !celebrityLocalization
        || ((event.live_type !== "recurring" || event.brand_id !== null) && (!brand || !brandLocalization))) {
        return [];
      }
      return [toLiveEventRecord(event, localization, celebrity, celebrityLocalization, brand && brandLocalization ? { ...brand, localization: brandLocalization } : null, event.live_status_overrides ?? [], onlyRow(event.live_event_previews))];
    });
  }

  findEventsWithMissions(locale: LiveLocale, now: Date) {
    return readEventsWithPublishedMissions(this.database, locale, now);
  }

  async findViewers(appUserId: string, events: readonly LiveEventRecord[]): Promise<ReadonlyMap<string, LiveViewerRecord>> {
    const [passportResult, reservationResult] = await Promise.all([
      this.database.from("fan_passports").select("celebrity_id").eq("app_user_id", appUserId).eq("business_status", "issued"),
      this.database.from("live_reservations").select("id, live_event_id, reserved_at").eq("app_user_id", appUserId),
    ]);
    if (passportResult.error || reservationResult.error) throw new Error("Live viewer lookup failed");
    const passports = new Set((passportResult.data ?? []).map((row) => row.celebrity_id as string));
    const reservationsByEvent = new Map((reservationResult.data ?? []).map((row) => [row.live_event_id as string, row]));
    const shownReservations = events.flatMap((event) => reservationsByEvent.get(event.id) ?? []);

    const stampsByReservation = new Map<string, LiveReservationSummary["stamp"]>();
    if (shownReservations.length > 0) {
      const [activityResult, stampResult] = await Promise.all([
        this.database.from("fan_activities").select("id, source_id").eq("app_user_id", appUserId).eq("activity_type", "reservation").eq("source_type", "live_reservation"),
        this.database.from("stamps").select("id, activity_id, business_status, mint_status").eq("app_user_id", appUserId).eq("stamp_type", "reservation"),
      ]);
      if (activityResult.error) throw new Error("Reservation activity lookup failed");
      if (stampResult.error) throw new Error("Reservation stamp lookup failed");
      const activityByReservation = new Map((activityResult.data ?? []).map((row) => [row.source_id as string, row.id as string]));
      const stampByActivity = new Map((stampResult.data ?? []).map((row) => [row.activity_id as string, row]));
      for (const reservation of shownReservations) {
        const activityId = activityByReservation.get(reservation.id);
        if (!activityId) throw new Error("Reservation activity projection is incomplete");
        const stamp = stampByActivity.get(activityId);
        if (!stamp) throw new Error("Reservation stamp projection is incomplete");
        stampsByReservation.set(reservation.id, { id: stamp.id, businessStatus: stamp.business_status, mintStatus: stamp.mint_status });
      }
    }

    return new Map(events.map((event) => {
      const reservation = reservationsByEvent.get(event.id);
      return [event.id, {
        hasPassport: passports.has(event.celebrity.id),
        reservation: reservation ? { id: reservation.id, createdAt: reservation.reserved_at, stamp: stampsByReservation.get(reservation.id)! } : null,
      }];
    }));
  }

  async findViewer(appUserId: string, event: LiveEventRecord): Promise<LiveViewerRecord> {
    const [passportResult, reservationResult] = await Promise.all([
      this.database.from("fan_passports").select("id").eq("app_user_id", appUserId).eq("celebrity_id", event.celebrity.id).eq("business_status", "issued").maybeSingle(),
      this.database.from("live_reservations").select("id, reserved_at").eq("app_user_id", appUserId).eq("live_event_id", event.id).maybeSingle(),
    ]);
    if (passportResult.error || reservationResult.error) throw new Error("Live viewer lookup failed");
    if (!reservationResult.data) {
      return { hasPassport: passportResult.data !== null, reservation: null };
    }

    const reservation = reservationResult.data;
    const { data: activity, error: activityError } = await this.database
      .from("fan_activities")
      .select("id")
      .eq("app_user_id", appUserId)
      .eq("activity_type", "reservation")
      .eq("source_type", "live_reservation")
      .eq("source_id", reservation.id)
      .maybeSingle();
    if (activityError) throw new Error("Reservation activity lookup failed");

    if (!activity) throw new Error("Reservation activity projection is incomplete");
    const { data: stampRow, error: stampError } = await this.database
      .from("stamps")
      .select("id, business_status, mint_status")
      .eq("activity_id", activity.id)
      .eq("stamp_type", "reservation")
      .maybeSingle();
    if (stampError) throw new Error("Reservation stamp lookup failed");
    if (!stampRow) throw new Error("Reservation stamp projection is incomplete");
    const stamp: LiveReservationSummary["stamp"] = {
      id: stampRow.id,
      businessStatus: stampRow.business_status,
      mintStatus: stampRow.mint_status,
    };
    return {
      hasPassport: passportResult.data !== null,
      reservation: { id: reservation.id, createdAt: reservation.reserved_at, stamp },
    };
  }
}

export function createLiveEventRepositoryFromEnvironment(config: {
  url: string | undefined;
  serviceRoleKey: string | undefined;
}): LiveEventRepository {
  const database = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new PublicImageLiveEventRepository(
    new DefaultLiveEventRepository(new SupabaseLiveEventDataSource(database)),
    createPublicImageRoleReader(config, database),
  );
}
