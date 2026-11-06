import { describe, expect, it } from "vitest";
import {
  RICH_DOCUMENT_MAX_BYTES,
  RichDocumentError,
  normalizeRichLink,
  parseYouTubeVideoId,
  plainTextToRichDocument,
  prepareRichPostBody,
  richDocumentAttachments,
  richDocumentPlainText,
  sanitizeRichDocument,
} from "./rich-document";

const asset = "11111111-1111-4111-8111-111111111111";
const doc = (...content: unknown[]) => ({ type: "doc", content });
const paragraph = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });

describe("sanitizeRichDocument", () => {
  it("keeps the allowed nodes and marks", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] },
      paragraph("굵게", [{ type: "bold" }, { type: "italic" }, { type: "underline" }]),
      paragraph("링크", [{ type: "link", attrs: { href: "https://kyaa.io/a?b=1" } }]),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("하나")] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [paragraph("둘")] }] },
      { type: "blockquote", content: [paragraph("인용")] },
      { type: "horizontalRule" },
      { type: "attachment", attrs: { assetId: asset, kind: "image" } },
      { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
    );
    expect(sanitizeRichDocument(input)).toEqual(input);
  });

  it("removes attributes it does not know", () => {
    const value = sanitizeRichDocument(doc(
      { type: "paragraph", attrs: { style: "position:fixed", onclick: "alert(1)" }, content: [{ type: "text", text: "a", onmouseover: "x" }] },
      { type: "attachment", attrs: { assetId: asset, kind: "image", src: "javascript:alert(1)", onerror: "alert(1)" } },
      { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ", src: "https://evil.example" } },
      { type: "paragraph", content: [{ type: "text", text: "b", marks: [{ type: "link", attrs: { href: "https://kyaa.io/", target: "_top", rel: "opener", class: "x" } }] }] },
    ));
    expect(value).toEqual(doc(
      paragraph("a"),
      { type: "attachment", attrs: { assetId: asset, kind: "image" } },
      { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
      paragraph("b", [{ type: "link", attrs: { href: "https://kyaa.io/" } }]),
    ));
  });

  it.each([
    ["script node", doc({ type: "script", content: [{ type: "text", text: "alert(1)" }] })],
    ["raw image with a source", doc({ type: "image", attrs: { src: "https://evil.example/a.png", alt: "a" } })],
    ["iframe", doc({ type: "iframe", attrs: { src: "https://evil.example" } })],
    ["html in a code block", doc({ type: "codeBlock", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] })],
    ["unknown mark", doc(paragraph("a", [{ type: "textStyle", attrs: { color: "red" } }]))],
    ["heading level 1", doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "a" }] })],
    ["javascript link", doc(paragraph("a", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))],
    ["data link", doc(paragraph("a", [{ type: "link", attrs: { href: "data:text/html,<script>alert(1)</script>" } }]))],
    ["http link", doc(paragraph("a", [{ type: "link", attrs: { href: "http://kyaa.io" } }]))],
    ["link with credentials", doc(paragraph("a", [{ type: "link", attrs: { href: "https://user:pass@kyaa.io" } }]))],
    ["path traversal asset", doc({ type: "attachment", attrs: { assetId: "../../etc/passwd", kind: "image" } })],
    ["unknown attachment kind", doc({ type: "attachment", attrs: { assetId: asset, kind: "audio" } })],
    ["script in a video id", doc({ type: "youtube", attrs: { videoId: "\"><script>" } })],
    ["list item outside a list", doc({ type: "listItem", content: [paragraph("a")] })],
    ["text at the top", doc({ type: "text", text: "a" })],
    ["block inside a paragraph", doc({ type: "paragraph", content: [paragraph("a")] })],
    ["empty list", doc({ type: "bulletList", content: [] })],
    ["not a document", { type: "paragraph" }],
    ["array", []],
    ["string", "<p>a</p>"],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(() => sanitizeRichDocument(value)).toThrow(RichDocumentError);
  });

  it("rejects a nesting deeper than an editor produces", () => {
    let value: unknown = paragraph("a");
    for (let index = 0; index < 40; index += 1) value = { type: "blockquote", content: [value] };
    expect(() => sanitizeRichDocument(doc(value))).toThrow(RichDocumentError);
  });

  it("rejects a document over the stored size", () => {
    const text = "가".repeat(RICH_DOCUMENT_MAX_BYTES);
    expect(() => sanitizeRichDocument(doc(paragraph(text)))).toThrow(RichDocumentError);
  });

  it("removes null bytes that the database cannot store", () => {
    expect(sanitizeRichDocument(doc(paragraph("a\u0000b")))).toEqual(doc(paragraph("ab")));
  });

  it("is stable when run twice", () => {
    const once = sanitizeRichDocument(doc(paragraph("a", [{ type: "bold" }]), { type: "paragraph" }));
    expect(sanitizeRichDocument(once)).toEqual(once);
  });
});

describe("richDocumentPlainText", () => {
  it("makes the text older clients read, with YouTube links kept", () => {
    const text = richDocumentPlainText(doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] },
      { type: "paragraph", content: [{ type: "text", text: "첫 줄" }, { type: "hardBreak" }, { type: "text", text: "둘째 줄" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("하나")] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [paragraph("둘")] }] },
      { type: "attachment", attrs: { assetId: asset, kind: "image" } },
      { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
    ) as never);
    expect(text).toBe("제목\n첫 줄\n둘째 줄\n- 하나\n1. 둘\nhttps://youtu.be/dQw4w9WgXcQ");
  });
});

describe("plainTextToRichDocument", () => {
  it("opens an existing post with its lines and attachments", () => {
    const value = plainTextToRichDocument("첫 줄\n\n둘째 줄", [{ assetId: asset, kind: "image" }]);
    expect(value).toEqual(doc(paragraph("첫 줄"), { type: "paragraph" }, paragraph("둘째 줄"), { type: "attachment", attrs: { assetId: asset, kind: "image" } }));
    expect(sanitizeRichDocument(value)).toEqual(value);
    expect(richDocumentPlainText(value)).toBe("첫 줄\n둘째 줄");
  });

  it("opens an empty post with an empty paragraph", () => {
    expect(plainTextToRichDocument("", [])).toEqual(doc({ type: "paragraph" }));
  });
});

describe("prepareRichPostBody", () => {
  const input = doc(paragraph("본문"), { type: "attachment", attrs: { assetId: asset, kind: "image" } });

  it("derives the plain body on the server and orders assets as written", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const prepared = prepareRichPostBody({ document: input, assetIds: [other, asset], maxPlainLength: 100 });
    expect(prepared.body).toBe("본문");
    expect(prepared.assetIds).toEqual([asset, other]);
  });

  it("rejects an attachment the post does not own", () => {
    expect(() => prepareRichPostBody({ document: input, assetIds: [], maxPlainLength: 100 })).toThrow(RichDocumentError);
  });

  it("rejects the same attachment twice", () => {
    const twice = doc({ type: "attachment", attrs: { assetId: asset, kind: "image" } }, { type: "attachment", attrs: { assetId: asset, kind: "image" } });
    expect(() => prepareRichPostBody({ document: twice, assetIds: [asset], maxPlainLength: 100 })).toThrow(RichDocumentError);
  });

  it("rejects text over the limit", () => {
    expect(() => prepareRichPostBody({ document: doc(paragraph("12345")), assetIds: [], maxPlainLength: 4 })).toThrow(RichDocumentError);
  });

  it("rejects too many YouTube links", () => {
    const many = doc(...Array.from({ length: 6 }, () => ({ type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } })));
    expect(() => prepareRichPostBody({ document: many, assetIds: [], maxPlainLength: 1000 })).toThrow(RichDocumentError);
  });

  it("lists attachments in reading order", () => {
    expect(richDocumentAttachments(sanitizeRichDocument(input))).toEqual([{ assetId: asset, kind: "image" }]);
  });
});

describe("parseYouTubeVideoId", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?list=a&v=dQw4w9WgXcQ&t=10",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "http://youtu.be/dQw4w9WgXcQ",
    "youtu.be/dQw4w9WgXcQ",
    "  https://youtu.be/dQw4w9WgXcQ  ",
  ])("reads %s", (url) => expect(parseYouTubeVideoId(url)).toBe("dQw4w9WgXcQ"));

  it.each([
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/short",
    "https://www.youtube.com/watch?v=<script>alert(1)",
    "https://www.youtube.com/channel/UCabcdefghij",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (url) => expect(parseYouTubeVideoId(url)).toBeNull());
});

describe("normalizeRichLink", () => {
  it.each([
    ["https://kyaa.io/a", "https://kyaa.io/a"],
    ["kyaa.io/a", "https://kyaa.io/a"],
    ["http://kyaa.io/a", "https://kyaa.io/a"],
    ["example.com:8443/a", "https://example.com:8443/a"],
  ])("accepts %s", (input, output) => expect(normalizeRichLink(input)).toBe(output));

  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,a", "vbscript:a", "mailto:a@b.c", "ftp://a.b/c", "https://user:pass@kyaa.io", "localhost", "", "   "])("rejects %s", (input) => {
    expect(normalizeRichLink(input)).toBeNull();
  });
});
