import { describe, expect, it } from "vitest";
import { linkifyDocument, splitLinks } from "./linkify";

const join = (text: string) => splitLinks(text).map(part => part.text).join("");

describe("splitLinks", () => {
  it("links the instagram address and keeps the original text byte for byte", () => {
    const text = "https://www.instagram.com/p/DfJw9D7ha--/";
    expect(splitLinks(text)).toEqual([{ type: "link", text, href: text }]);
  });
  it.each([
    ["오늘 영상 https://youtu.be/abc?t=3, 꼭 봐주세요", "https://youtu.be/abc?t=3"],
    ["(https://example.com/a_(b))", "https://example.com/a_(b)"],
    ["끝에 마침표 https://example.com/x.", "https://example.com/x"],
    ["링크https://example.com/path?utm_source=a&x=1#hash를 누르세요", "https://example.com/path?utm_source=a&x=1#hash"],
  ])("trims punctuation and keeps query and hash: %s", (text, expected) => {
    const link = splitLinks(text).find(part => part.type === "link");
    expect(link && "href" in link ? link.href : null).toBe(expected);
    expect(join(text)).toBe(text);
  });
  it("adds https for www. and leaves the shown text untouched", () => {
    expect(splitLinks("www.example.com/a")).toEqual([{ type: "link", text: "www.example.com/a", href: "https://www.example.com/a" }]);
  });
  it("ignores non-web schemes and addresses without a dot", () => {
    for (const text of ["javascript:alert(1)", "ftp://example.com/a", "http://localhost/a", "mailto:a@b.com"]) expect(splitLinks(text)).toEqual([{ type: "text", text }]);
  });
  it("keeps line breaks around links", () => {
    const text = "첫 줄\nhttps://a.example/x\n끝";
    expect(join(text)).toBe(text);
    expect(splitLinks(text).filter(part => part.type === "link")).toHaveLength(1);
  });
});

describe("linkifyDocument", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "보기 https://example.com/a 끝" },
    { type: "text", text: "https://already.example/", marks: [{ type: "link", attrs: { href: "https://other.example/" } }] },
    { type: "text", text: "https://code.example/", marks: [{ type: "code" }] },
  ] }] };
  it("marks bare addresses in a copy and leaves existing links, code and the stored document unchanged", () => {
    const before = JSON.stringify(doc);
    const result = linkifyDocument(doc);
    expect(JSON.stringify(doc)).toBe(before);
    const nodes = result.content![0].content!;
    expect(nodes.map(node => node.text).join("")).toBe("보기 https://example.com/a 끝https://already.example/https://code.example/");
    expect(nodes[1].marks?.[0]).toMatchObject({ type: "link", attrs: { href: "https://example.com/a" } });
    expect(nodes[3].marks?.[0].attrs?.href).toBe("https://other.example/");
    expect(nodes[4].marks).toEqual([{ type: "code" }]);
  });
});
