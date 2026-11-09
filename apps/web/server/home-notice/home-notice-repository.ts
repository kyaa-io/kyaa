import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import {
  homeNoticeCategories,
  homeNoticePageSchema,
  homeNoticeSummarySchema,
  type HomeNoticeCategory,
  type HomeNoticePage,
  type HomeNoticeSummary,
} from "@/features/home/domain/home-notice";
import type { AdminSession } from "../admin/admin-session-gate";
import { parseNoticeDocument, type TiptapDocument } from "../notice/notice-domain";

type Db = Pick<SupabaseClient, "rpc">;
export type HomeNoticeActor = Pick<AdminSession, "role" | "appUserId" | "allowlistId">;
export type HomeNoticeDetail = HomeNoticeSummary & Readonly<{ body: TiptapDocument }>;
export type HomeNoticeSaveInput = Readonly<{
  id?: string;
  expectedRevision?: number;
  slug: string;
  category: HomeNoticeCategory;
  pinned: boolean;
  linkedGroupPageId?: string | null;
  localizations: Readonly<{ ko: Readonly<{ title: string; body: unknown }>; en: Readonly<{ title: string; body: unknown }> }>;
}>;
export type HomeNoticeStateInput = Readonly<{ id: string; expectedRevision: number; action: "publish" | "unpublish" | "archive"; reason?: string }>;

export class HomeNoticeRepositoryError extends Error {
  /** PostgreSQL SQLSTATE from PostgREST when the error came from SQL (23505 unique, 23514 check, …). */
  constructor(message: string, readonly code?: string) { super(message); }
}

const detailSchema = homeNoticeSummarySchema.extend({ body: z.unknown() }).strict();

/** Opaque keyset cursor over (pinned, publishedAt, id), the order of read_public_home_notices. */
export function encodeHomeNoticeCursor(item: Pick<HomeNoticeSummary, "pinned" | "publishedAt" | "id">): string {
  return Buffer.from(JSON.stringify([item.pinned, item.publishedAt, item.id])).toString("base64url");
}
const cursorSchema = z.tuple([z.boolean(), z.iso.datetime({ offset: true }), z.uuid()]);
export function decodeHomeNoticeCursor(value: string): { pinned: boolean; publishedAt: string; id: string } | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? { pinned: parsed.data[0], publishedAt: parsed.data[1], id: parsed.data[2] } : null;
  } catch {
    return null;
  }
}

export class HomeNoticeRepository {
  constructor(private readonly db: Db) {}

  async listPublished(locale: "ko" | "en", input: { limit: number; cursor?: string | null }): Promise<HomeNoticePage> {
    const before = input.cursor ? decodeHomeNoticeCursor(input.cursor) : null;
    if (input.cursor && !before) throw new HomeNoticeRepositoryError("Invalid home notice cursor");
    const { data, error } = await this.db.rpc("read_public_home_notices", {
      p_locale: locale,
      p_before_pinned: before?.pinned ?? null,
      p_before: before?.publishedAt ?? null,
      p_before_id: before?.id ?? null,
      p_limit: input.limit,
    });
    if (error) throw new HomeNoticeRepositoryError(error.message, error.code);
    const page = homeNoticePageSchema.parse(data);
    const last = page.items.at(-1);
    return { items: page.items, nextCursor: page.hasMore && last ? encodeHomeNoticeCursor(last) : null };
  }

  async findPublished(locale: "ko" | "en", slug: string): Promise<HomeNoticeDetail | null> {
    const { data, error } = await this.db.rpc("read_public_home_notice", { p_locale: locale, p_slug: slug });
    if (error) throw new HomeNoticeRepositoryError(error.message, error.code);
    if (data === null) return null;
    const row = detailSchema.parse(data);
    return { ...row, body: parseNoticeDocument(row.body, { privateImages: "reject" }) };
  }

  async listAdmin(actor: HomeNoticeActor) {
    const params = { p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId };
    const [notices, targets] = await Promise.all([this.db.rpc("list_admin_home_notices", params), this.db.rpc("list_admin_home_notice_link_targets", params)]);
    for (const result of [notices, targets]) if (result.error) throw new HomeNoticeRepositoryError(result.error.message, result.error.code);
    return {
      role: actor.role,
      notices: z.array(z.record(z.string(), z.unknown())).parse(notices.data),
      linkTargets: z.array(z.object({ id: z.uuid(), name: z.string().min(1), slug: z.string().min(1) }).strict()).parse(targets.data),
    };
  }

  async save(actor: HomeNoticeActor, correlationId: string, input: HomeNoticeSaveInput) {
    if (actor.role === "viewer") throw new HomeNoticeRepositoryError("viewer is read-only");
    if (!(homeNoticeCategories as readonly string[]).includes(input.category)) throw new HomeNoticeRepositoryError("Invalid category");
    const ko = parseNoticeDocument(input.localizations.ko.body, { privateImages: "reject" });
    const en = parseNoticeDocument(input.localizations.en.body, { privateImages: "reject" });
    const { data, error } = await this.db.rpc("save_admin_home_notice", {
      p_actor_app_user_id: actor.appUserId,
      p_actor_admin_allowlist_id: actor.allowlistId,
      p_correlation_id: correlationId,
      p_notice_id: input.id ?? null,
      p_expected_revision: input.expectedRevision ?? null,
      p_slug: input.slug,
      p_category: input.category,
      p_pinned: input.pinned,
      p_title_ko: input.localizations.ko.title.trim(),
      p_body_ko: ko,
      p_title_en: input.localizations.en.title.trim(),
      p_body_en: en,
      p_linked_group_page_id: input.linkedGroupPageId ?? null,
    });
    if (error) throw new HomeNoticeRepositoryError(error.message, error.code);
    return { id: z.uuid().parse(data) };
  }

  async state(actor: HomeNoticeActor, correlationId: string, input: HomeNoticeStateInput) {
    if (actor.role === "viewer") throw new HomeNoticeRepositoryError("viewer is read-only");
    const { error } = await this.db.rpc("set_admin_home_notice_state", {
      p_actor_app_user_id: actor.appUserId,
      p_actor_admin_allowlist_id: actor.allowlistId,
      p_correlation_id: correlationId,
      p_notice_id: input.id,
      p_expected_revision: input.expectedRevision,
      p_action: input.action,
      p_reason: input.reason ?? null,
    });
    if (error) throw new HomeNoticeRepositoryError(error.message, error.code);
    return { ok: true as const };
  }
}

export function createHomeNoticeRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Db) {
  return new HomeNoticeRepository(client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
