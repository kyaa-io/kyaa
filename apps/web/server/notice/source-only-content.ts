import { deepStrictEqual } from "node:assert/strict";
import { z } from "zod";
import { parseNoticeDocument } from "./notice-domain.ts";

const httpsUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});
const inputSchema = z.object({
  source: z.object({ url: httpsUrl, title: z.string().max(100_000).default(""), text: z.string().max(100_000) }).strict()
    .refine(source => Boolean(source.title.trim() || source.text.trim()), "Original source text is required"),
  images: z.array(z.object({ src: z.string(), width: z.number().int().positive(), height: z.number().int().positive() }).strict()).max(2).default([]),
}).strict();

export function buildSourceOnlyLocalizations(input: unknown) {
  const { source, images } = inputSchema.parse(input);
  const originalTitle = source.title.trim() || source.text.split(/\r?\n/).find(line => line.trim())!.trim();
  // The CMS title limit is 160 UTF-16 units; the full source remains in the body.
  let title = "";
  for (const character of originalTitle) {
    if (title.length + character.length > 160) break;
    title += character;
  }
  const paragraph = (text: string) => ({ type: "paragraph", content: text.split("\n").flatMap((line, index) => [
    ...(index ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : []),
  ]) });
  const body = parseNoticeDocument({ type: "doc", content: [
    ...(source.title && source.title !== source.text ? [paragraph(source.title)] : []),
    ...(source.text ? [paragraph(source.text)] : []),
    ...images.map(image => ({ type: "image", attrs: { ...image, alt: title } })),
    { type: "paragraph", content: [{ type: "text", text: source.url, marks: [{ type: "link", attrs: { href: source.url, target: "_blank", rel: "noopener noreferrer" } }] }] },
  ] });
  return { ko: { title, body }, en: { title, body } };
}

export function assertSourceOnlyLocalizations(input: unknown, actual: unknown) {
  deepStrictEqual(actual, buildSourceOnlyLocalizations(input), "Imported content must match the original in every locale");
}
