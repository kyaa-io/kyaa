import "server-only";
import { z } from "zod";
import { loadServerEnv } from "@/server/config/env";
import { createClient } from "@/server/data/client";
import { createPublicHomeNoticeRepository } from "@/server/home-notice/home-notice-dependencies";
import { isStaticNoticeImage } from "@/server/notice/notice-domain";
import { creatorRaffleHref } from "@/features/benefit/domain/raffle-navigation";
import { raffleStatus } from "@/features/benefit/domain/raffle";
import { listPublicRaffles } from "./public-past-raffles";

const slug = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const archiveRegistration = z.object({
  round_key: slug,
  source_kind: z.enum(["live_campaign", "group_raffle", "runmusic", "notice"]),
  source_id: z.string().trim().min(1).max(120),
  notice_slug: slug,
  closes_at: z.iso.datetime({ offset: true }),
  results_notice_slug: slug.nullable(),
  published: z.boolean(),
  is_test: z.boolean(),
}).strict().refine(row => row.source_kind === "notice" ? slug.safeParse(row.source_id).success :
  row.source_kind === "runmusic" ? row.source_id === "runmusic-2026" : z.uuid().safeParse(row.source_id).success);

export function archiveDatabase() {
  const env = loadServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

type ArchiveItem = { key: string; title: string; closesAt: string; image: string | null; resultPath: string | null };

export async function readPastDrawArchive(locale: "ko" | "en", now: Date) {
  const db = archiveDatabase(), notices = createPublicHomeNoticeRepository();
  const [raffles, archive] = await Promise.all([
    listPublicRaffles(locale, now),
    db.from("past_draw_published_archive").select("*").lte("closes_at", now.toISOString()),
  ]);
  if (archive.error) throw archive.error;
  const rows = z.array(archiveRegistration).parse(archive.data);
  const items = new Map<string, ArchiveItem>();
  await Promise.all(rows.map(async row => {
    const notice = await notices.findPublished(locale, row.notice_slug);
    if (!notice) return;
    const result = row.results_notice_slug ? await notices.findPublished(locale, row.results_notice_slug) : null;
    const key = row.source_kind === "live_campaign" ? `campaign-${row.source_id}` : `archive-${row.round_key}`;
    items.set(key, {
      key, title: notice.title, closesAt: row.closes_at,
      image: notice.body.content.flatMap(node => {
        const src = (node.attrs as { src?: unknown } | undefined)?.src;
        return node.type === "image" && isStaticNoticeImage(src) ? [src] : [];
      })[0] ?? null,
      resultPath: result ? `/notices/${result.slug}` : null,
    });
  }));

  const byId = new Map(raffles
    .filter(({ raffle }) => raffleStatus(raffle, now.getTime()) === "closed" && raffle.entryClosesAt)
    .map(entry => [entry.raffle.id, entry]));
  // A benefit may appear in multiple rounds. The detail page opens the first
  // matching public item, so link only when it resolves to this archive row.
  const detailItems = new Map<string, string>();
  for (const { raffle, creator } of raffles) {
    const detailKey = `${creator.slug}:${raffle.benefitId}`;
    if (raffle.benefitId && !detailItems.has(detailKey)) detailItems.set(detailKey, raffle.id);
  }
  const ids = [...byId.keys()];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await db.from("past_draw_public_items").select("id,campaign_id")
      .in("id", ids.slice(offset, offset + 100)).lte("entry_closes_at", now.toISOString()).order("id");
    if (error) throw error;
    for (const row of data) {
      const entry = byId.get(row.id);
      const key = `campaign-${row.campaign_id}`;
      if (!entry?.raffle.entryClosesAt || items.has(key)) continue;
      const { raffle, creator } = entry;
      items.set(key, {
        key, title: raffle.title, closesAt: entry.raffle.entryClosesAt,
        image: raffle.imageUrl,
        resultPath: raffle.benefitId && raffle.resultsPublishedAt && Date.parse(raffle.resultsPublishedAt) <= now.getTime()
          && detailItems.get(`${creator.slug}:${raffle.benefitId}`) === raffle.id
          ? creatorRaffleHref(creator.slug, raffle.benefitId, locale).split("?")[0]! : null,
      });
    }
  }
  return [...items.values()].sort((a, b) => Date.parse(b.closesAt) - Date.parse(a.closesAt) || a.key.localeCompare(b.key));
}
