import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { giftUnreadSchema, type GiftUnread } from "../../features/gifts/domain/gift";
import { ownerMySummarySchema, prioritizeReservedLives, type MySummary, type OwnerMySummary } from "../../features/my/domain/my-summary";
import { SupabasePublishedContentRepository, type PublishedContentClient } from "../content/published-content-repository";
import { createPublicImageRoleReader, type PublicImageRoleReader } from "../media/public-image-reader";

interface RpcClient {
  rpc(name: string, parameters: Record<string, string>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** The favorite the fan named in MY (feedback C1/C2, D's fan_profile_public_fields). Absent until that migration is applied, so a failure is "unknown". */
export interface ProfileFavoriteReader {
  read(appUserId: string, locale: "ko" | "en"): Promise<{ slug: string; name: string } | null>;
}
const profileFavoriteSchema = z.object({ favorite: z.object({ slug: z.string().min(1), name: z.string() }).nullable() });
export class SupabaseProfileFavoriteReader implements ProfileFavoriteReader {
  constructor(private readonly client: RpcClient) {}
  async read(appUserId: string, locale: "ko" | "en") {
    const { data, error } = await this.client.rpc("read_owned_fan_profile_public", { p_app_user_id: appUserId, p_locale: locale });
    if (error) throw new Error("Profile favorite query failed");
    const favorite = profileFavoriteSchema.parse(data).favorite;
    return favorite ? { slug: favorite.slug, name: favorite.name } : null;
  }
}

/** Unread gifts. Kept apart from the summary function so that function (and its migration) stays as it is. */
export interface GiftUnreadReader {
  read(appUserId: string): Promise<GiftUnread>;
}
export class SupabaseGiftUnreadReader implements GiftUnreadReader {
  constructor(private readonly client: RpcClient) {}
  async read(appUserId: string) {
    const { data, error } = await this.client.rpc("get_owned_gift_unread", { p_app_user_id: appUserId });
    if (error) throw new Error("Gift unread query failed");
    return giftUnreadSchema.parse(data);
  }
}

/** Reads the creator of each owned passport and its hearts. Separate from the summary function so that function (and its migration) stays as it is. */
export interface PassportHeartsReader {
  read(appUserId: string, passportIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

interface PassportTableClient extends RpcClient {
  from(table: "fan_passports"): { select(columns: string): { eq(column: string, value: string): { in(column: string, values: readonly string[]): PromiseLike<{ data: unknown; error: unknown }> } } };
}

const passportCreatorRows = z.array(z.object({ id: z.string().uuid(), celebrity_id: z.string().uuid() }));
const heartsValue = z.number().int().nonnegative();

/** passport_hearts(user, creator): the same function the fan list (read_group_public_people_hearts) and the tier read, so one definition everywhere. */
export class SupabasePassportHeartsReader implements PassportHeartsReader {
  constructor(private readonly client: PassportTableClient) {}
  async read(appUserId: string, passportIds: readonly string[]) {
    if (passportIds.length === 0) return new Map<string, number>();
    const { data, error } = await this.client.from("fan_passports").select("id,celebrity_id").eq("app_user_id", appUserId).in("id", passportIds);
    if (error) throw new Error("Passport hearts query failed");
    const rows = passportCreatorRows.parse(data);
    const pairs = await Promise.all(rows.map(async (row) => {
      const result = await this.client.rpc("passport_hearts", { p_user: appUserId, p_celebrity: row.celebrity_id });
      if (result.error) throw new Error("Passport hearts query failed");
      return [row.id, heartsValue.parse(result.data)] as const;
    }));
    return new Map(pairs);
  }
}

export interface MySummaryRepository {
  get(input: { appUserId: string; locale: "ko" | "en"; asOf: Date; includeStages?: boolean; includeHearts?: boolean; includeGifts?: boolean }): Promise<MySummary>;
}

interface OwnerMySummaryRepository {
  get(input: { appUserId: string; locale: "ko" | "en"; asOf: Date; includeStages?: boolean }): Promise<OwnerMySummary>;
}

interface PublicCreatorDirectory {
  list(locale: "ko" | "en"): Promise<readonly { slug: string }[]>;
}

export class SupabaseMySummaryRepository implements OwnerMySummaryRepository {
  constructor(private readonly client: RpcClient) {}
  async get(input: { appUserId: string; locale: "ko" | "en"; asOf: Date; includeStages?: boolean }): Promise<OwnerMySummary> {
    const read = async (includeStages: boolean) => {
      const { data, error } = await this.client.rpc(includeStages ? "get_owned_my_fan_activity_with_stages" : "get_owned_my_fan_activity", {
        p_app_user_id: input.appUserId,
        p_locale: input.locale,
        p_as_of: input.asOf.toISOString(),
      });
      if (error) throw new Error("MY summary query failed");
      return ownerMySummarySchema.safeParse(data);
    };
    let parsed = await read(input.includeStages === true);
    // A stage projection the contract rejects drops only the optional stage detail: callers already show the tier label
    // when stageProgress is absent, exactly as for a request without tierStages.
    if (!parsed.success && input.includeStages) {
      console.warn("MY_SUMMARY_STAGE_FALLBACK", { reason: "STAGE_PROJECTION_INVALID" });
      parsed = await read(false);
    }
    if (!parsed.success) throw new Error("MY summary projection is invalid");
    const summary: OwnerMySummary = parsed.data;
    const upcoming = prioritizeReservedLives(summary.live.upcoming, input.asOf.getTime());
    const upcomingIds = new Set(upcoming.map((event) => event.id));
    // Open-ended recurring schedules can stay scheduled after their start; preserve them as history.
    const history = [...summary.live.history, ...summary.live.upcoming.filter((event) => !upcomingIds.has(event.id))]
      .toSorted((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt) || right.id.localeCompare(left.id));
    return { ...summary, live: { upcoming, history } };
  }
}

export class PublicImageMySummaryRepository implements MySummaryRepository {
  constructor(
    private readonly repository: OwnerMySummaryRepository,
    private readonly images: PublicImageRoleReader,
    private readonly published: PublicCreatorDirectory,
    private readonly hearts?: PassportHeartsReader,
    private readonly favorite?: ProfileFavoriteReader,
    private readonly gifts?: GiftUnreadReader,
  ) {}

  async get(input: { appUserId: string; locale: "ko" | "en"; asOf: Date; includeStages?: boolean; includeHearts?: boolean; includeGifts?: boolean }): Promise<MySummary> {
    const read = await this.repository.get(input);
    // A failed gift read leaves the key out, like a request without gifts=1: no glow rather than a wrong one.
    const gifts = input.includeGifts && this.gifts ? await this.gifts.read(input.appUserId).catch(() => {
      console.warn("MY_SUMMARY_GIFTS_FALLBACK", { reason: "GIFTS_READ_FAILED" });
      return null;
    }) : null;
    const [withHeartCounts, favorite] = input.includeHearts ? await Promise.all([
      this.hearts ? withHearts(read, input.appUserId, this.hearts) : read,
      this.favorite ? this.favorite.read(input.appUserId, input.locale).then((value) => ({ value }), () => null) : null,
    ]) : [read, null];
    const withFavorite: OwnerMySummary = favorite ? { ...withHeartCounts, favorite: favorite.value } : withHeartCounts;
    const summary: OwnerMySummary = gifts ? { ...withFavorite, gifts } : withFavorite;
    if (summary.creators.length === 0) return { ...summary, creators: [] };
    const slugs = summary.creators.map(({ celebrity }) => celebrity.slug);
    const [photosBySlug, publicCreators] = await Promise.all([
      this.images.readCelebrityPhotoSetsBySlug(slugs),
      this.published.list(input.locale),
    ]);
    const publicSlugs = new Set(publicCreators.map(({ slug }) => slug));
    return {
      ...summary,
      creators: summary.creators.map((creator) => {
        const photos = photosBySlug[creator.celebrity.slug];
        return {
          ...creator,
          celebrity: {
            ...creator.celebrity,
            ...(photos === undefined ? {} : { photos }),
            isPublic: publicSlugs.has(creator.celebrity.slug),
          },
        };
      }),
    };
  }
}

/** Adds `passport.hearts` (C1 header ♥N). A failed hearts read leaves the key out, like a request without hearts=1: the header then shows no number rather than a wrong one. */
async function withHearts(summary: OwnerMySummary, appUserId: string, reader: PassportHeartsReader): Promise<OwnerMySummary> {
  const ids = summary.creators.flatMap((creator) => creator.passport ? [creator.passport.id] : []);
  let hearts: ReadonlyMap<string, number>;
  try { hearts = await reader.read(appUserId, ids); } catch {
    console.warn("MY_SUMMARY_HEARTS_FALLBACK", { reason: "HEARTS_READ_FAILED" });
    return summary;
  }
  return { ...summary, creators: summary.creators.map((creator) => {
    const value = creator.passport ? hearts.get(creator.passport.id) : undefined;
    return value === undefined || !creator.passport ? creator : { ...creator, passport: { ...creator.passport, hearts: value } };
  }) };
}

export function createSupabaseMySummaryRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: RpcClient): MySummaryRepository {
  const database = client ?? createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return new PublicImageMySummaryRepository(
    new SupabaseMySummaryRepository(database as unknown as RpcClient),
    createPublicImageRoleReader(config, database as unknown as SupabaseClient),
    new SupabasePublishedContentRepository(database as unknown as PublishedContentClient),
    new SupabasePassportHeartsReader(database as unknown as PassportTableClient),
    new SupabaseProfileFavoriteReader(database as unknown as RpcClient),
    new SupabaseGiftUnreadReader(database as unknown as RpcClient),
  );
}
