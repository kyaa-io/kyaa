import { describe, expect, it } from "vitest";
import { postTitleSlots } from "./post-title-slots";

// The same table is in supabase/tests/content_translation_slots.sql (S1); keep the two identical.
const cases: Array<[string, string, string[]]> = [
  ["title and article", "제목\n본문", ["title", "article"]],
  ["title only", "제목", ["title"]],
  ["blank article", "제목\n  \n", ["title"]],
  ["article only", "\n본문", ["article"]],
  ["blank", "  ", []],
  ["empty", "", []],
  ["a lone line break", "\n", []],
  ["NBSP title", " \n본문", ["article"]],
  ["ideographic space title", "　\n본문", ["article"]],
  ["BOM title", "﻿\n본문", ["article"]],
  ["unicode spaces title", "       \n본문", ["article"]],
  ["CRLF", "제목\r\n본문", ["title", "article"]],
  ["CRLF without article", "제목\r\n", ["title"]],
  ["CRLF without title", "\r\n본문", ["article"]],
  ["whitespace article", "제목\n \t \u000b\u000c", ["title"]],
  ["zero-width space is text", "​\n본문", ["title", "article"]],
  ["mongolian vowel separator is text", "᠎\n본문", ["title", "article"]],
  ["blank line between", "제목\n\n본문", ["title", "article"]],
];
describe("postTitleSlots", () => {
  it.each(cases)("%s", (_name, body, slots) => {
    expect(postTitleSlots(body).map(item => item.slot)).toEqual(slots);
  });
  it("cuts at the first line break and keeps the text as written", () => {
    expect(postTitleSlots("제목\r\n본문\n둘째 줄")).toEqual([{ slot: "title", text: "제목\r" }, { slot: "article", text: "본문\n둘째 줄" }]);
    expect(postTitleSlots("제목\n\n본문")).toEqual([{ slot: "title", text: "제목" }, { slot: "article", text: "\n본문" }]);
  });
});
