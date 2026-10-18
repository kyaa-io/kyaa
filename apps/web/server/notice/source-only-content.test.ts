import { expect, it } from "vitest";
import { buildSourceOnlyLocalizations, assertSourceOnlyLocalizations } from "./source-only-content";
import { parseNoticeDocument } from "./notice-domain";

const source = { url: "https://www.instagram.com/elina_4_22/p/DeHIWuSkwJE/", text: "Cooking class with @loccitane 🍊🍪\n아몬드 한라봉 쿠키 만들었당ㅎㅎ" };
const input = { source, images: [{ src: "/api/content-assets/20000000-0000-4000-8000-000000000002", width: 3024, height: 4032 }] };

it("copies the original caption into both locales without descriptions or translations", () => {
  const result = buildSourceOnlyLocalizations(input);
  expect(result.en).toEqual(result.ko);
  expect(result.ko.title).toBe("Cooking class with @loccitane 🍊🍪");
  expect(result.ko.body.content).toEqual([
    { type: "paragraph", content: [{ type: "text", text: source.text.split("\n")[0] }, { type: "hardBreak" }, { type: "text", text: source.text.split("\n")[1] }] },
    { type: "image", attrs: { ...input.images[0], alt: result.ko.title } },
    { type: "paragraph", content: [{ type: "text", text: source.url, marks: [{ type: "link", attrs: { href: source.url, target: "_blank", rel: "noopener noreferrer" } }] }] },
  ]);
  expect(() => parseNoticeDocument(result.ko.body)).not.toThrow();
  expect(() => assertSourceOnlyLocalizations(input, result)).not.toThrow();
});

it("keeps the full original text while limiting the title to an original excerpt", () => {
  const text = `  ${"원문🎉".repeat(100)}\n second line  `;
  const result = buildSourceOnlyLocalizations({ source: { ...source, text } });
  expect(text).toContain(result.ko.title);
  expect(result.ko.title.length).toBeLessThanOrEqual(160);
  const paragraph = result.ko.body.content[0] as { content: { type: string; text?: string }[] };
  expect(paragraph.content.map(node => node.type === "hardBreak" ? "\n" : node.text).join("")).toBe(text);
  const boundary = `${"a".repeat(159)}🎉b`;
  expect(buildSourceOnlyLocalizations({ source: { ...source, text: boundary } }).ko.title).toBe("a".repeat(159));
});

it("accepts an original video title and refuses missing text, unsafe URLs, and invented alt input", () => {
  expect(buildSourceOnlyLocalizations({ source: { url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Original video 🎥", text: "" } }).en.title).toBe("Original video 🎥");
  for (const invalid of [
    { source: { ...source, text: " \n " } },
    { source: { ...source, url: "javascript:alert(1)" } },
    { source: { ...source, url: "https://user:password@example.com/post" } },
    { ...input, images: [{ ...input.images[0], alt: "앞치마를 입고 쿠키 반죽을 준비하는 엘리나" }] },
  ]) expect(() => buildSourceOnlyLocalizations(invalid)).toThrow();
});

it("rejects translated titles and rewritten bodies when comparing the CMS readback", () => {
  const result = buildSourceOnlyLocalizations(input);
  expect(() => assertSourceOnlyLocalizations(input, { ...result, en: { ...result.en, title: "엘리나의 쿠킹 클래스" } })).toThrow();
  expect(() => assertSourceOnlyLocalizations(input, { ...result, ko: { ...result.ko, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "공식 Instagram 콘텐츠를 소개합니다." }] }] } } })).toThrow();
});
