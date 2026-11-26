import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { askExamples, askFollowups, askLinesFor, askReaction, askRecall, askReply, askResultExamples, askResultLine, askSubjectFor, askWaiting, ASK_REACTIONS, ASK_RECALLS, ASK_TOPICS } from "../lines";
import { askPacks } from "./index";

/**
 * 케미 97 13회차(CHEMI-R13A-I18N-1126): 질문하기 문구가 한국어 밖 언어에서 한국어·영어·빈칸으로 남지 않았는지 본다.
 * 12회차 채점에서 en·ja·th 의 대사·예시 질문·칩이 모두 한국어였다.
 */
const hangul = /[가-힣]/;
const latin = /[A-Za-z]{3}/;
const CHARACTERS = ["changha", "elina", "yuna", "dosa"] as const;
const CONTENTS = ["saju", "fortune", "star", "tarot"] as const;
const locales = APP_LOCALES.filter((locale) => locale !== "ko");

function strings(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => strings(child, prefix ? `${prefix}.${key}` : key));
}

/** 화면에 나오는 모든 질문하기 문구를 최애·콘텐츠·날짜를 돌려 가며 실제 함수로 모은다. */
function shown(locale: (typeof locales)[number]) {
  const rows: [string, string][] = [];
  for (const who of CHARACTERS) {
    const lines = askLinesFor(who, locale);
    rows.push([`${who}.topic`, lines.topic], [`${who}.again`, lines.again], [`${who}.follow`, lines.follow], [`${who}.reminded`, lines.reminded], [`${who}.shared`, lines.shared]);
    rows.push([`${who}.recall1`, lines.recall(1)], [`${who}.recall3`, lines.recall(3)]);
    for (const content of CONTENTS) {
      rows.push([`${who}.think.${content}`, lines.think(askSubjectFor(content, locale))], [`${who}.rest.${content}`, lines.rest[content]]);
      rows.push([`${who}.resultLine.${content}`, askResultLine(content, who, locale)]);
      for (const day of ["2026-11-26", "2026-11-27"]) askResultExamples(content, who, day, locale).forEach((text, at) => rows.push([`${who}.result.${content}.${day}.${at}`, text]));
    }
    for (const [key, text] of Object.entries(lines.recalled)) rows.push([`${who}.recalled.${key}`, text]);
    for (const [key, text] of Object.entries(lines.react)) rows.push([`${who}.react.${key}`, text]);
    for (const topic of ASK_TOPICS) {
      rows.push([`${who}.reask.${topic}`, lines.reask[topic]]);
      askExamples(topic, who, locale).forEach((text, at) => rows.push([`${who}.example.${topic}.${at}`, text]));
    }
    for (const kind of ASK_REACTIONS) rows.push([`${who}.chip.${kind}`, askReaction(kind, who, locale)]);
    for (const kind of ASK_RECALLS) rows.push([`${who}.recall.${kind}`, askRecall(kind, who, locale)]);
    askFollowups(who, null, locale).forEach((text, at) => rows.push([`${who}.followup.${at}`, text]));
    rows.push([`${who}.waiting`, askWaiting(who, locale)], [`${who}.quote`, askReply("really", who, "답", locale)]);
  }
  return rows;
}

describe("ask scene copy in every language", () => {
  const english = new Map(shown("en"));
  for (const locale of locales) {
    it(`${locale}: nothing empty, Korean, or left in English`, () => {
      const rows = shown(locale);
      expect(rows.filter(([, text]) => text.trim() === "").map(([key]) => key), "empty").toEqual([]);
      expect(rows.filter(([, text]) => hangul.test(text.replace("답", ""))).map(([key]) => key), "Korean").toEqual([]);
      expect(rows.filter(([, text]) => /\{\w+\}/.test(text)).map(([key]) => key), "unfilled placeholder").toEqual([]);
      if (locale === "en") return;
      expect(rows.filter(([key, text]) => english.get(key) === text && latin.test(text)).map(([key]) => key), "same as English").toEqual([]);
      if (!["es", "pt", "fr", "id", "vi"].includes(locale))
        expect(rows.filter(([, text]) => /(?:[A-Za-z]+\s+){3}[A-Za-z]+/.test(text)).map(([key]) => key), "English sentence").toEqual([]);
    });

    it(`${locale}: every template keeps its placeholders`, () => {
      const pack = askPacks[locale as keyof typeof askPacks];
      for (const voice of Object.values(pack.voices)) {
        expect(voice.think).toContain("{what}");
        expect(voice.recallDays).toContain("{days}");
        expect(voice.recallFirst).not.toContain("{days}");
      }
      for (const own of Object.values(pack.own)) expect(own.think).toContain("{what}");
      for (const quote of Object.values(pack.quote)) expect(quote).toContain("{q}");
    });
  }

  it("keeps the speaker's register: casual, polite and sage voices differ", () => {
    for (const locale of locales) {
      const voices = askPacks[locale as keyof typeof askPacks].voices;
      expect(new Set([voices.ban.topic, voices.yo.topic, voices.hao.topic]).size, locale).toBe(3);
    }
  });

  it("gives each idol their own opening, in every language", () => {
    for (const locale of locales) {
      const [changha, elina, yuna, dosa] = CHARACTERS.map((who) => askLinesFor(who, locale).topic);
      expect(new Set([changha, elina, yuna, dosa]).size, locale).toBe(4);
    }
  });

  it("falls back to the Korean lines when no language is given", () => {
    expect(askLinesFor("changha").topic).toBe("좋아, 오늘은 뭐부터 털어놔 볼래? 다 들어 줄게.");
    expect(askLinesFor("dosa").recall(3)).toBe("오늘로 3일째구려. 지난번에 물은 일은 어찌 되었소?");
    expect(askExamples("free", "elina")).toEqual(["오늘 뭘 조심하면 좋을까요?", "제 장점을 어떻게 쓰면 좋을까요?"]);
  });

  it("keeps the casual and polite chip forms apart where the language has them", () => {
    expect(askReaction("thanks", "changha", "ja")).toBe("ありがとう");
    expect(askReaction("thanks", "elina", "ja")).toBe("ありがとうございます");
    expect(askReaction("thanks", "elina", "en")).toBe("Thanks");
  });

  it("quotes the answer in the reader's language", () => {
    expect(askReply("really", "elina", "첫 문장이에요. 둘째 문장.", "en")).toBe("Yes. Try thinking back to “첫 문장이에요”.");
    expect(askReply("thanks", "yuna", "x", "th")).toBe(askLinesFor("yuna", "th").react.thanks);
  });
});
