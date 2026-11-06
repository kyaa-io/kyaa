/**
 * Stored rich-text format of board posts. Shared by the server (input gate) and the client (read gate), so it stays free of React and Tiptap.
 * A document is rebuilt from allowed fields only. Nothing in it is rendered as HTML, and media is referenced by id, never by URL.
 */
/** Fits 20,000 characters of Korean in the usual line lengths, with formatting. The database check allows the same document in its stored form. */
export const RICH_DOCUMENT_MAX_BYTES = 256 * 1024;
const MAX_DEPTH = 12;
const MAX_NODES = 20000;
export const RICH_DOCUMENT_MAX_YOUTUBE = 5;

export type RichAttachmentKind = "image" | "video";
export type RichAttachment = Readonly<{ assetId: string; kind: RichAttachmentKind }>;
export type RichMark = { type: "bold" | "italic" | "underline" } | { type: "link"; attrs: { href: string } };
export type RichNode = {
  type: string;
  attrs?: Record<string, string | number>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
};
export type RichDocument = { type: "doc"; content: RichNode[] };

/** A SyntaxError so both board routes answer it as their existing 400 invalid-input response. */
export class RichDocumentError extends SyntaxError {
  constructor(reason: string) { super(`RICH_DOCUMENT_INVALID:${reason}`); this.name = "RichDocumentError"; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule", "attachment", "youtube"]);
const INLINE = new Set(["text", "hardBreak"]);
const LIST_ITEM = new Set(["listItem"]);
const CHILDREN: Readonly<Record<string, ReadonlySet<string> | undefined>> = {
  paragraph: INLINE, heading: INLINE, bulletList: LIST_ITEM, orderedList: LIST_ITEM, listItem: BLOCKS, blockquote: BLOCKS,
};
const SIMPLE_MARKS = new Set(["bold", "italic", "underline"]);

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function safeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
  } catch { return false; }
}

function sanitizeMarks(value: unknown): RichMark[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new RichDocumentError("marks");
  const marks: RichMark[] = [];
  for (const entry of value) {
    const mark = record(entry);
    if (!mark || typeof mark.type !== "string") throw new RichDocumentError("mark");
    if (SIMPLE_MARKS.has(mark.type)) marks.push({ type: mark.type as "bold" | "italic" | "underline" });
    else if (mark.type === "link") {
      const href = record(mark.attrs)?.href;
      if (!safeHttpsUrl(href)) throw new RichDocumentError("link");
      // The parsed address, not the input: what was checked is what is stored.
      marks.push({ type: "link", attrs: { href: new URL(href).href } });
    } else throw new RichDocumentError("mark-type");
  }
  return marks.length ? marks : undefined;
}

function sanitizeNode(value: unknown, allowed: ReadonlySet<string>, depth: number, budget: { nodes: number }): RichNode | null {
  const node = record(value);
  if (!node || typeof node.type !== "string" || !allowed.has(node.type)) throw new RichDocumentError("node");
  if (depth > MAX_DEPTH) throw new RichDocumentError("depth");
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) throw new RichDocumentError("nodes");
  const attrs = record(node.attrs);
  switch (node.type) {
    case "text": {
      if (typeof node.text !== "string") throw new RichDocumentError("text");
      const text = node.text.replaceAll("\u0000", "");
      if (!text) return null;
      const marks = sanitizeMarks(node.marks);
      return { type: "text", text, ...(marks ? { marks } : {}) };
    }
    case "hardBreak": return { type: "hardBreak" };
    case "horizontalRule": return { type: "horizontalRule" };
    case "attachment": {
      if (typeof attrs?.assetId !== "string" || !UUID.test(attrs.assetId) || (attrs.kind !== "image" && attrs.kind !== "video")) throw new RichDocumentError("attachment");
      return { type: "attachment", attrs: { assetId: attrs.assetId.toLowerCase(), kind: attrs.kind } };
    }
    case "youtube": {
      if (typeof attrs?.videoId !== "string" || !YOUTUBE_ID.test(attrs.videoId)) throw new RichDocumentError("youtube");
      return { type: "youtube", attrs: { videoId: attrs.videoId } };
    }
  }
  const allowedChildren = CHILDREN[node.type];
  if (!allowedChildren) throw new RichDocumentError("node");
  if (node.content !== undefined && !Array.isArray(node.content)) throw new RichDocumentError("content");
  const content = ((node.content as unknown[] | undefined) ?? []).map(child => sanitizeNode(child, allowedChildren, depth + 1, budget)).filter((child): child is RichNode => child !== null);
  const needsContent = node.type === "bulletList" || node.type === "orderedList" || node.type === "listItem" || node.type === "blockquote";
  if (needsContent && !content.length) throw new RichDocumentError("empty");
  if (node.type === "heading") {
    if (attrs?.level !== 2 && attrs?.level !== 3) throw new RichDocumentError("heading");
    return { type: "heading", attrs: { level: attrs.level }, ...(content.length ? { content } : {}) };
  }
  return { type: node.type, ...(content.length ? { content } : {}) };
}

/** Returns a new document holding only allowed nodes, marks and attributes. Unknown nodes and marks are refused rather than dropped, unknown attributes are dropped. */
export function sanitizeRichDocument(value: unknown): RichDocument {
  const document = record(value);
  if (!document || document.type !== "doc" || !Array.isArray(document.content) || !document.content.length) throw new RichDocumentError("doc");
  const budget = { nodes: 0 };
  const content = document.content.map(child => sanitizeNode(child, BLOCKS, 1, budget)).filter((child): child is RichNode => child !== null);
  if (!content.length) throw new RichDocumentError("doc");
  const result: RichDocument = { type: "doc", content };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > RICH_DOCUMENT_MAX_BYTES) throw new RichDocumentError("size");
  return result;
}

/** Read gate for a stored value: an unreadable document falls back to the plain body. */
export function readRichDocument(value: unknown): RichDocument | null {
  if (value === undefined || value === null) return null;
  try { return sanitizeRichDocument(value); } catch { return null; }
}

function inlineText(node: RichNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function blockLines(node: RichNode): string[] {
  switch (node.type) {
    case "paragraph": case "heading": { const text = inlineText(node).trim(); return text ? text.split("\n").map(line => line.trim()) : []; }
    case "youtube": return [`https://youtu.be/${node.attrs?.videoId}`];
    case "bulletList": return (node.content ?? []).flatMap(item => (item.content ?? []).flatMap(blockLines).map(line => `- ${line}`));
    case "orderedList": return (node.content ?? []).flatMap((item, index) => (item.content ?? []).flatMap(blockLines).map(line => `${index + 1}. ${line}`));
    case "blockquote": return (node.content ?? []).flatMap(blockLines);
    default: return [];
  }
}

/** Lines of one top-level block. An empty paragraph is a blank line, so paragraphs stay apart in `body`. */
function documentLines(node: RichNode): string[] {
  return (node.type === "paragraph" || node.type === "heading") && !inlineText(node).trim() ? [""] : blockLines(node);
}
const withoutOuterBlankLines = (text: string) => text.replace(/^\n+|\n+$/g, "");

/** The text stored in `body`. Older clients, lists, search, translation, reports and point checks keep reading it. */
export function richDocumentPlainText(document: RichDocument): string {
  return withoutOuterBlankLines(document.content.flatMap(documentLines).join("\n"));
}

export function richDocumentAttachments(document: RichDocument): RichAttachment[] {
  const found: RichAttachment[] = [];
  const walk = (node: RichNode) => {
    if (node.type === "attachment") found.push({ assetId: String(node.attrs?.assetId), kind: node.attrs?.kind as RichAttachmentKind });
    node.content?.forEach(walk);
  };
  document.content.forEach(walk);
  return found;
}

function countYouTube(nodes: readonly RichNode[]): number {
  return nodes.reduce((total, node) => total + (node.type === "youtube" ? 1 : 0) + countYouTube(node.content ?? []), 0);
}

export function richDocumentHasContent(document: RichDocument): boolean {
  return richDocumentPlainText(document).trim().length > 0 || richDocumentAttachments(document).length > 0;
}

/** An existing plain post opened in the editor: one paragraph per line, its attachments after the text. */
export function plainTextToRichDocument(text: string, attachments: readonly RichAttachment[]): RichDocument {
  const lines = text.trim() ? text.trim().split("\n") : [];
  const content: RichNode[] = lines.map(line => line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" });
  for (const item of attachments) content.push({ type: "attachment", attrs: { assetId: item.assetId, kind: item.kind } });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

const textParagraph = (text: string): RichNode => text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };

/**
 * A plain edit (older web, mobile app, feed composer) changes `body` and leaves the document alone. Reading brings them together:
 * blocks whose text is still there keep their formatting and place, changed lines become plain paragraphs, media stays.
 * The result's plain text is always the given text.
 */
export function mergePlainTextIntoDocument(document: RichDocument, text: string): RichDocument {
  const target = withoutOuterBlankLines(text.split("\n").map(line => line.trim()).join("\n"));
  if (richDocumentPlainText(document) === target) return document;
  const lines = target ? target.split("\n") : [];
  const blocks = document.content.map(documentLines), starts = new Map<number, number>();
  let search = 0;
  blocks.forEach((block, index) => {
    if (!block.length) return;
    // A blank line only matches where it stands. Looking ahead for one would skip the text blocks between.
    if (block.length === 1 && block[0] === "") { if (lines[search] === "") { starts.set(index, search); search += 1; } return; }
    for (let start = search; start + block.length <= lines.length; start += 1) {
      if (block.every((line, offset) => lines[start + offset] === line)) { starts.set(index, start); search = start + block.length; return; }
    }
  });
  const content: RichNode[] = [];
  let cursor = 0;
  const emitUntil = (end: number) => { while (cursor < end) content.push(textParagraph(lines[cursor++] as string)); };
  document.content.forEach((node, index) => {
    const block = blocks[index] as string[], start = starts.get(index);
    if (!block.length) { content.push(node); return; }
    if (start !== undefined) { emitUntil(start); content.push(node); cursor = start + block.length; return; }
    let next = lines.length;
    for (let later = index + 1; later < blocks.length; later += 1) { const value = starts.get(later); if (value !== undefined) { next = value; break; } }
    emitUntil(next);
  });
  emitUntil(lines.length);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

const NEEDS_CONTENT = new Set(["bulletList", "orderedList", "listItem", "blockquote"]);

/** Takes out media the post no longer has, and any list item, list or quote left empty by that at any depth. */
function withoutMissingAttachments(nodes: readonly RichNode[], kept: ReadonlySet<string>): RichNode[] {
  return nodes.flatMap(node => {
    if (node.type === "attachment") return kept.has(String(node.attrs?.assetId)) ? [node] : [];
    if (!node.content) return [node];
    const content = withoutMissingAttachments(node.content, kept);
    return content.length || !NEEDS_CONTENT.has(node.type) ? [{ ...node, content }] : [];
  });
}

/** Server read gate: the stored document, matched to the post's current text and attachments. null falls back to the plain body. */
export function richDocumentForPost(stored: unknown, text: string, assetIds: readonly string[]): RichDocument | null {
  const document = readRichDocument(stored);
  if (!document) return null;
  const kept = new Set(assetIds.map(id => id.toLowerCase()));
  const content = withoutMissingAttachments(document.content, kept);
  return readRichDocument(mergePlainTextIntoDocument({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] }, text));
}

/** Server input gate. `body` is always derived here so a client cannot store text that differs from the document. */
export function prepareRichPostBody({ document, assetIds, maxPlainLength }: { document: unknown; assetIds: readonly string[]; maxPlainLength: number }) {
  const sanitized = sanitizeRichDocument(document);
  const attachments = richDocumentAttachments(sanitized), owned = new Set(assetIds.map(id => id.toLowerCase())), seen = new Set<string>();
  for (const item of attachments) {
    if (!owned.has(item.assetId) || seen.has(item.assetId)) throw new RichDocumentError("attachment-owner");
    seen.add(item.assetId);
  }
  if (countYouTube(sanitized.content) > RICH_DOCUMENT_MAX_YOUTUBE) throw new RichDocumentError("youtube-count");
  const body = richDocumentPlainText(sanitized);
  if (body.length > maxPlainLength) throw new RichDocumentError("length");
  return { document: sanitized, body, assetIds: [...attachments.map(item => item.assetId), ...assetIds.map(id => id.toLowerCase()).filter(id => !seen.has(id))] };
}

const YOUTUBE_WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** Reads only the video id from a YouTube address. The rest of the address is not kept. */
export function parseYouTubeVideoId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  let id: string | null | undefined;
  if (url.hostname === "youtu.be") id = url.pathname.split("/")[1];
  else if (YOUTUBE_WATCH_HOSTS.has(url.hostname)) {
    const [, section, value] = url.pathname.split("/");
    id = section === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed", "v"].includes(section ?? "") ? value : null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Link dialog input to a stored address. Only HTTPS is stored. */
export function normalizeRichLink(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let candidate: string;
  if (/^https:\/\//i.test(text)) candidate = text;
  else if (/^http:\/\//i.test(text)) candidate = `https://${text.slice(7)}`;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[\w-]+(\.[\w-]+)+(:\d+)(\/|$)/.test(text)) return null;
  else candidate = `https://${text}`;
  if (!safeHttpsUrl(candidate)) return null;
  return new URL(candidate).toString();
}
