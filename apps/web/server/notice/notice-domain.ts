import { z } from "zod";

export const noticeLocaleSchema = z.enum(["ko", "en"]);
export type NoticeLocale = z.infer<typeof noticeLocaleSchema>;
export function parseNoticeLocaleParams(params: URLSearchParams): NoticeLocale | null {
  const values = params.getAll("locale");
  if (values.length > 1) return null;
  const result = noticeLocaleSchema.safeParse(values[0] ?? "ko");
  return result.success ? result.data : null;
}

export type TiptapDocument = Readonly<{
  type: "doc";
  content: readonly Record<string, unknown>[];
}>;

const allowedNodes = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  "image",
  "video",
  "externalVideo",
  "text",
  "hardBreak",
]);
const allowedMarks = new Set(["bold", "italic", "underline", "link"]);

function safeHttps(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isPrivateNoticeImage(value: unknown): value is string {
  return typeof value === "string" && /^\/api\/content-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isPublicOfficialMedia(value: unknown, thumbnail = false): boolean {
  return typeof value === "string" && new RegExp(`^/api/public/notice-media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}${thumbnail ? "\\?variant=thumbnail" : ""}$`, "i").test(value);
}

function validateNode(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 30) {
    throw new Error("Invalid Notice document");
  }
  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string" || !allowedNodes.has(node.type)) {
    throw new Error("Unsupported Notice node");
  }
  if (node.type === "heading") {
    const level = (node.attrs as Record<string, unknown> | undefined)?.level;
    if (level !== 2 && level !== 3) throw new Error("Only H2 and H3 are allowed");
  }
  if (node.type === "image") {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if ((!safeHttps(attrs?.src) && !isPrivateNoticeImage(attrs?.src) && !isPublicOfficialMedia(attrs?.src)) || typeof attrs?.alt !== "string" || !attrs.alt.trim()) {
      throw new Error("Notice images require an HTTPS source and alt text");
    }
  }
  if (node.type === "video") {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (!isPublicOfficialMedia(attrs?.src) || !isPublicOfficialMedia(attrs?.poster, true)
      || typeof attrs?.alt !== "string" || !attrs.alt.trim()
      || typeof attrs?.width !== "number" || !Number.isInteger(attrs.width) || attrs.width <= 0
      || typeof attrs?.height !== "number" || !Number.isInteger(attrs.height) || attrs.height <= 0
      || typeof attrs?.durationSeconds !== "number" || !Number.isFinite(attrs.durationSeconds)
      || attrs.durationSeconds <= 0 || attrs.durationSeconds > 60) {
      throw new Error("Notice videos require a validated official-media source, poster and metadata");
    }
    const sourceId = (attrs.src as string).split("/").at(-1);
    const posterId = (attrs.poster as string).split("/").at(-1)?.split("?")[0];
    if (sourceId !== posterId) throw new Error("Notice video poster must belong to the same asset");
  }
  if (node.type === "externalVideo") {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const available = attrs?.state === undefined || attrs.state === "available";
    if ((!available && attrs?.state !== "unavailable")
      || (available ? !safeHttps(attrs?.src) : attrs?.src !== null && attrs?.src !== undefined)
      || (attrs?.poster != null && !safeHttps(attrs.poster))
      || typeof attrs?.alt !== "string" || !attrs.alt.trim() || attrs.alt.length > 200
      || typeof attrs?.width !== "number" || !Number.isInteger(attrs.width) || attrs.width <= 0 || attrs.width > 16384
      || typeof attrs?.height !== "number" || !Number.isInteger(attrs.height) || attrs.height <= 0 || attrs.height > 16384
      || (attrs?.durationSeconds != null && (typeof attrs.durationSeconds !== "number" || !Number.isFinite(attrs.durationSeconds) || attrs.durationSeconds <= 0))
      || (attrs?.sourceLabel != null && (typeof attrs.sourceLabel !== "string" || !attrs.sourceLabel.trim() || attrs.sourceLabel.length > 80))) {
      throw new Error("External videos require a registered HTTPS URL or an unavailable state, with image metadata");
    }
  }
  if (Array.isArray(node.marks)) {
    for (const markValue of node.marks) {
      if (!markValue || typeof markValue !== "object") throw new Error("Invalid Notice mark");
      const mark = markValue as Record<string, unknown>;
      if (typeof mark.type !== "string" || !allowedMarks.has(mark.type)) throw new Error("Unsupported Notice mark");
      if (mark.type === "link" && !safeHttps((mark.attrs as Record<string, unknown> | undefined)?.href)) {
        throw new Error("Notice links must use HTTPS");
      }
    }
  }
  let meaningful = node.type === "image" || node.type === "video" || node.type === "externalVideo";
  if (node.type === "text" && typeof node.text === "string" && node.text.trim()) {
    meaningful = true;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw new Error("Invalid Notice content");
    meaningful = node.content.map((child) => validateNode(child, depth + 1)).some(Boolean) || meaningful;
  }
  return meaningful;
}

export function parseNoticeDocument(value: unknown): TiptapDocument {
  const meaningful = validateNode(value);
  const document = value as Record<string, unknown>;
  if (document.type !== "doc" || !Array.isArray(document.content) || !meaningful) {
    throw new Error("Notice body is required");
  }
  return value as TiptapDocument;
}

export const noticeSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type PublicNoticeSummary = Readonly<{
  slug: string;
  title: string;
  pinned: boolean;
  kind: "standard" | "welcome";
  publishedAt: string;
}>;

export type PublicNoticeDetail = PublicNoticeSummary &
  Readonly<{ body: TiptapDocument }>;
