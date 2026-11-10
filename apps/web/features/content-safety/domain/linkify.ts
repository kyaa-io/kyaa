import type { JSONContent } from "@tiptap/core";

export type TextPart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_PATTERN = /(?:https?:\/\/|www\.)[\x21-\x7E]+/gi;
const TRAILING = /[.,;:!?'"\]}>]$/;

function trimUrl(raw: string) {
  let value = raw.replace(/[<"'].*$/, "");
  for (;;) {
    if (TRAILING.test(value)) { value = value.slice(0, -1); continue; }
    if (value.endsWith(")") && (value.match(/\)/g)?.length ?? 0) > (value.match(/\(/g)?.length ?? 0)) { value = value.slice(0, -1); continue; }
    return value;
  }
}

function webHref(value: string) {
  const href = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(href);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? href : null;
  } catch { return null; }
}

/** Splits plain text into text and web-link parts. The joined part text always equals the input. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const value = trimUrl(match[0]), start = match.index ?? 0, href = value ? webHref(value) : null;
    if (!href) continue;
    if (start > cursor) parts.push({ type: "text", text: text.slice(cursor, start) });
    parts.push({ type: "link", text: value, href });
    cursor = start + value.length;
  }
  if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", text }];
}

/** Display-only copy of a notice document where bare web addresses carry a link mark. The stored document is never changed. */
export function linkifyDocument(node: JSONContent): JSONContent {
  if (!node.content) return node;
  const content: JSONContent[] = [];
  for (const child of node.content) {
    if (child.type !== "text" || !child.text || child.marks?.some(mark => mark.type === "link" || mark.type === "code")) { content.push(linkifyDocument(child)); continue; }
    const parts = splitLinks(child.text);
    if (parts.length === 1 && parts[0].type === "text") { content.push(child); continue; }
    for (const part of parts) {
      content.push({ ...child, text: part.text, marks: part.type === "link" ? [...(child.marks ?? []), { type: "link", attrs: { href: part.href, target: "_blank", rel: "noreferrer" } }] : child.marks });
    }
  }
  return { ...node, content };
}
