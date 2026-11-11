import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertSourceOnlyLocalizations, buildSourceOnlyLocalizations } from "../notice/source-only-content.ts";
import {
  allowedImageUrl, parseAccountUrl, parsePostUrl, snsIngestPlatforms, snsIngestSlug,
} from "./source-url.ts";

export const SNS_INGEST_PER_RUN_LIMIT = 5;
const MAX_SOURCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Only original source fields. Instagram and TikTok posts have no title of their own,
// so the request carries none; title, body and alt text are built on the server.
export const snsIngestRequestSchema = z.object({
  celebritySlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  platform: z.enum(snsIngestPlatforms),
  collectorError: z.enum(["BLOCKED_LOGIN", "STRUCTURE_CHANGED", "SOURCE_UNAVAILABLE"]).optional(),
  posts: z.array(z.object({
    sourceId: z.string().min(1).max(64),
    sourceUrl: z.string().max(2048),
    sourcePublishedAt: z.iso.datetime({ offset: true }),
    text: z.string().max(100_000),
    videoThumbnail: z.object({ url: z.string().max(4096) }).strict().optional(),
    images: z.array(z.object({ url: z.string().max(4096) }).strict()).max(2).default([]),
  }).strict()).max(30),
}).strict().refine(value => !value.collectorError || value.posts.length === 0, "A failed collection carries no posts");
export type SnsIngestRequest = z.infer<typeof snsIngestRequestSchema>;

export type SnsIngestItemStatus = "published" | "duplicate" | "blocked" | "held" | "deferred" | "skipped" | "rejected";
export type SnsIngestItem = { slug: string | null; sourceUrl: string; status: SnsIngestItemStatus; reason?: string; noticeId?: string };

export type SnsIngestDeps = {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  fetchImage(url: URL): Promise<Uint8Array>;
  processImage(bytes: Uint8Array): Promise<{ bytes: Uint8Array; thumbnail: Uint8Array; width: number; height: number; sha256: string }>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  now(): Date;
};

export class SnsIngestSourceError extends Error {}

const contextSchema = z.object({ celebrityId: z.uuid(), accountUrl: z.string() }).strict().nullable();
const savedSchema = z.object({ status: z.enum(["created", "restored", "duplicate", "blocked"]), noticeId: z.uuid(), revision: z.number().int().positive() }).strict();
const draftSchema = z.object({
  revision: z.number().int().positive(),
  publicationStatus: z.string(),
  localizations: z.record(z.string(), z.object({ title: z.string(), body: z.unknown() }).strict()),
}).strict();

export function createSnsIngestService(deps: SnsIngestDeps) {
  async function ingestPost(runId: string, handle: string, post: SnsIngestRequest["posts"][number], slug: string): Promise<SnsIngestItem> {
    const item = (status: SnsIngestItemStatus, reason?: string, noticeId?: string): SnsIngestItem =>
      ({ slug, sourceUrl: post.sourceUrl, status, ...(reason ? { reason } : {}), ...(noticeId ? { noticeId } : {}) });
    const cover = post.videoThumbnail ? allowedImageUrl(post.videoThumbnail.url) : null;
    if (post.videoThumbnail && !cover) return item("rejected", "IMAGE_HOST_NOT_ALLOWED");
    const images = post.images.map(image => allowedImageUrl(image.url));
    if (images.some(image => image === null)) return item("rejected", "IMAGE_HOST_NOT_ALLOWED");
    // A photo post without a caption is titled with the source account only (source-only-content.md).
    const source = { url: post.sourceUrl, title: !post.text.trim() && post.images.length ? `@${handle}` : "", text: post.text };
    let draft: ReturnType<typeof buildSourceOnlyLocalizations>;
    try { draft = buildSourceOnlyLocalizations({ source, images: [] }); } catch { return item("rejected", "SOURCE_TEXT_MISSING"); }
    const save = async (localizations: typeof draft) => savedSchema.parse(await deps.rpc("sns_ingest_save_draft", {
      p_run_id: runId, p_slug: slug, p_source_url: post.sourceUrl, p_source_published_at: post.sourcePublishedAt,
      p_title: localizations.ko.title, p_body: localizations.ko.body,
    }));
    let saved = await save(draft);
    if (saved.status === "duplicate" || saved.status === "blocked") return item(saved.status, undefined, saved.noticeId);
    const noticeId = saved.noticeId;
    const stored: { src: string; width: number; height: number }[] = [];
    try {
      for (const url of [...images, ...(cover ? [cover] : [])] as URL[]) {
        const image = await deps.processImage(await deps.fetchImage(url));
        const mediaId = randomUUID();
        const storagePath = `sns-ingest/${noticeId}/${mediaId}.webp`;
        const thumbnailPath = `sns-ingest/${noticeId}/${mediaId}-thumbnail.webp`;
        await deps.rpc(cover === url ? "sns_ingest_register_video_thumbnail" : "sns_ingest_register_media", {
          p_run_id: runId, p_notice_id: noticeId, p_media_id: mediaId, p_storage_path: storagePath, p_thumbnail_path: thumbnailPath,
          p_width: image.width, p_height: image.height, p_byte_size: image.bytes.byteLength, p_sha256: image.sha256, p_source_host: url.hostname,
        });
        await deps.upload(storagePath, image.bytes);
        await deps.upload(thumbnailPath, image.thumbnail);
        if (cover !== url) stored.push({ src: `/api/public/notice-media/${mediaId}`, width: image.width, height: image.height });
      }
    } catch {
      return item("held", "IMAGE_FAILED", noticeId);
    }
    const input = { source, images: stored };
    if (stored.length) saved = await save(buildSourceOnlyLocalizations(input));
    // Publish only what the database returns unchanged from the original.
    const readback = draftSchema.parse(await deps.rpc("sns_ingest_read_draft", { p_notice_id: noticeId }));
    try {
      if (readback.publicationStatus !== "draft" || readback.revision !== saved.revision) throw new Error("changed");
      assertSourceOnlyLocalizations(input, readback.localizations);
    } catch {
      return item("held", "READBACK_MISMATCH", noticeId);
    }
    if (stored.length || cover) return item("held", "PHOTO_REVIEW_REQUIRED", noticeId);
    await deps.rpc("sns_ingest_publish", { p_run_id: runId, p_notice_id: noticeId, p_expected_revision: readback.revision });
    return item("published", undefined, noticeId);
  }

  return {
    async ingest(request: SnsIngestRequest, correlationId: string) {
      const context = contextSchema.parse(await deps.rpc("sns_ingest_source_context", { p_celebrity_slug: request.celebritySlug, p_platform: request.platform }));
      const account = context && parseAccountUrl(request.platform, context.accountUrl);
      if (!context || !account) throw new SnsIngestSourceError("SOURCE_NOT_REGISTERED");
      const runId = z.uuid().parse(await deps.rpc("sns_ingest_begin_run", {
        p_celebrity_id: context.celebrityId, p_platform: request.platform, p_account_url: context.accountUrl,
        p_correlation_id: correlationId, p_collector_error: request.collectorError ?? null,
      }));
      const items: SnsIngestItem[] = [];
      try {
        let attempted = 0;
        const now = deps.now().getTime();
        for (const post of request.posts) {
          const parsed = parsePostUrl(request.platform, post.sourceUrl);
          if (!parsed || parsed.handle !== account.handle || parsed.sourceId !== post.sourceId) {
            items.push({ slug: null, sourceUrl: post.sourceUrl, status: "rejected", reason: "SOURCE_ACCOUNT_MISMATCH" });
            continue;
          }
          const slug = snsIngestSlug(request.platform, post.sourceId);
          const publishedAt = Date.parse(post.sourcePublishedAt);
          if (publishedAt > now + 60 * 60 * 1000) { items.push({ slug, sourceUrl: post.sourceUrl, status: "rejected", reason: "PUBLISHED_IN_FUTURE" }); continue; }
          if (publishedAt < now - MAX_SOURCE_AGE_MS) { items.push({ slug, sourceUrl: post.sourceUrl, status: "skipped", reason: "OLDER_THAN_30_DAYS" }); continue; }
          if (items.some(existing => existing.slug === slug)) { items.push({ slug, sourceUrl: post.sourceUrl, status: "duplicate" }); continue; }
          if (attempted >= SNS_INGEST_PER_RUN_LIMIT) { items.push({ slug, sourceUrl: post.sourceUrl, status: "deferred", reason: "PER_RUN_LIMIT" }); continue; }
          const result = await ingestPost(runId, account.handle, post, slug);
          if (result.status !== "duplicate" && result.status !== "blocked" && result.status !== "rejected") attempted += 1;
          items.push(result);
        }
      } catch (error) {
        await deps.rpc("sns_ingest_finish_run", { p_run_id: runId, p_items: items, p_succeeded: false }).catch(() => undefined);
        throw error;
      }
      await deps.rpc("sns_ingest_finish_run", { p_run_id: runId, p_items: items, p_succeeded: !request.collectorError });
      return { runId, items };
    },
  };
}
