import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";

/** kyaa's own notices (home_notices, plan R8-DATA §3). Everything published is public; there is no visibility or post type. */
export const homeNoticeCategories = ["guide", "creator", "event", "update"] as const;
export type HomeNoticeCategory = (typeof homeNoticeCategories)[number];

export const homeNoticeSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(homeNoticeCategories),
  pinned: z.boolean(),
  publishedAt: z.string().min(1),
  title: z.string().min(1).max(160),
}).strict();
export type HomeNoticeSummary = z.infer<typeof homeNoticeSummarySchema>;

export const homeNoticePageSchema = z.object({
  items: z.array(homeNoticeSummarySchema).max(20),
  hasMore: z.boolean(),
}).strict();

export type HomeNoticePage = Readonly<{ items: readonly HomeNoticeSummary[]; nextCursor: string | null }>;

export const homeNoticeCategoryLabels: Record<AppLocale, Record<HomeNoticeCategory, string>> = {
  ko: { guide: "안내", creator: "크리에이터", event: "이벤트", update: "업데이트" },
  en: { guide: "Guide", creator: "Creators", event: "Event", update: "Update" },
  ja: { guide: "ご案内", creator: "クリエイター", event: "イベント", update: "アップデート" },
  "zh-Hans": { guide: "指南", creator: "创作者", event: "活动", update: "更新" },
  "zh-Hant": { guide: "指南", creator: "創作者", event: "活動", update: "更新" },
  es: { guide: "Guía", creator: "Creadores", event: "Evento", update: "Novedad" },
  id: { guide: "Panduan", creator: "Kreator", event: "Acara", update: "Pembaruan" },
  vi: { guide: "Hướng dẫn", creator: "Nhà sáng tạo", event: "Sự kiện", update: "Cập nhật" },
  th: { guide: "คู่มือ", creator: "ครีเอเตอร์", event: "กิจกรรม", update: "อัปเดต" },
  pt: { guide: "Guia", creator: "Criadores", event: "Evento", update: "Novidade" },
  fr: { guide: "Guide", creator: "Créateurs", event: "Événement", update: "Mise à jour" },
  ru: { guide: "Справка", creator: "Авторы", event: "Событие", update: "Обновление" },
};
