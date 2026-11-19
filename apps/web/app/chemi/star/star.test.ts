import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./reading.fixture.json";
import {
  domainLabels,
  domainLine,
  domainLong,
  domains,
  overallHeadline,
  reasonView,
  signNames,
  starBestLine,
  starCharacters,
  starPairLine,
  starSayLine,
  todayDo,
  todayDont,
  type ZodiacSign,
} from "./copy";
import { withParticle } from "./particle";
import { parseTodayStar } from "./reading";
import { elementCounts, modalityCounts, natalAspects } from "./astro";
import { nextStarStep, parseStarStep, reachableStarStep, starTalkNumber } from "@/features/chemi/domain/star-step";

// 로컬 DB에 실제로 저장된 별자리 풀이 응답(POST /api/chemi/readings, 2026-11-19, 태어난 시간 모름).
describe("star reading response", () => {
  afterEach(() => vi.useRealTimers());

  it("accepts the real route response only for the same KST day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${fixture.kstDate}T03:00:00Z`));
    expect(parseTodayStar(fixture)?.result.stars.overall).toBe(fixture.result.stars.overall);
    vi.setSystemTime(new Date("2026-11-21T03:00:00Z"));
    expect(parseTodayStar(fixture)).toBeNull();
  });

  it("rejects other contents and malformed results", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${fixture.kstDate}T03:00:00Z`));
    expect(parseTodayStar({ ...fixture, content: "fortune" })).toBeNull();
    expect(parseTodayStar({ ...fixture, kind: "compat" })).toBeNull();
    expect(parseTodayStar({ ...fixture, result: { ...fixture.result, stars: { ...fixture.result.stars, love: 6 } } })).toBeNull();
    expect(parseTodayStar({ ...fixture, result: { ...fixture.result, natal: fixture.result.natal.slice(0, 9) } })).toBeNull();
    expect(parseTodayStar({ ...fixture, result: { ...fixture.result, signs: { sun: [], moon: ["cancer"] } } })).toBeNull();
    expect(parseTodayStar({ ...fixture, result: { ...fixture.result, signs: { sun: ["nope"], moon: ["cancer"] } } })).toBeNull();
    expect(parseTodayStar(null)).toBeNull();
  });
});

describe("star copy", () => {
  it("has one line for every star count in every area", () => {
    for (const key of domains) {
      expect(domainLine[key]).toHaveLength(5);
      expect(domainLong[key]).toHaveLength(5);
      expect(todayDo[key]).toHaveLength(3);
      expect(todayDont[key]).toHaveLength(3);
    }
    expect(overallHeadline).toHaveLength(5);
    expect(Object.keys(domainLabels).sort()).toEqual(["love", "money", "overall", "people", "work"]);
  });

  it("attaches particles by final consonant", () => {
    expect(withParticle("해", "과와")).toBe("해와");
    expect(withParticle("금성", "과와")).toBe("금성과");
    expect(withParticle("창하", "이가")).toBe("창하가");
    expect(withParticle("kyaa 도사", "이가")).toBe("kyaa 도사가");
    expect(withParticle("네 달(게자리)", "과와")).toBe("네 달(게자리)과");
    expect(withParticle("네 화성(사자자리)", "과와")).toBe("네 화성(사자자리)과");
    expect(withParticle("네 해(황소자리)", "과와")).toBe("네 해(황소자리)와");
    expect(withParticle("토성", "은는")).toBe("토성은");
  });

  it("turns server reasons into the screen sentences", () => {
    const signOf = (target: string) => (fixture.result.natal.find((p) => p.body === target)?.sign as ZodiacSign) ?? null;
    const [moon, uranus] = fixture.result.reasons.map((reason) => reasonView(reason, signOf, fixture.kstDate));
    expect(moon).toMatchObject({ title: "달과 내 달", aspect: "삼각", domain: "overall", up: false });
    expect(moon!.when).toMatch(/^오늘 .+ \d+시쯤 가장 강해요$/);
    expect(uranus!.title).toBe("천왕성과 내 수성");
    expect(uranus!.when).toBe("12월 12일(토)까지");
    expect(moon!.text).toBe("달은 네 달(게자리)과 한 발 멀어지고 있어요. 작은 일에 마음이 쓰일 수 있어요.");
    expect(uranus!.text).toBe("천왕성은 네 수성(쌍둥이자리)과 겹쳐서 부담을 줘요. 작은 일에 마음이 쓰일 수 있어요.");
  });

  it("gives every character a line for every scene, without a creator sign for the dosa", () => {
    for (const character of starCharacters) {
      expect(starBestLine(character.id, "애정", "돈")).toContain("애정");
      expect(starSayLine(character.id, "love", 5)).toContain("5개");
      expect(starSayLine(character.id, "money", 2)).not.toContain("undefined");
    }
    expect(starPairLine("dosa", "황소", null)).not.toContain("undefined");
    expect(starCharacters.find((c) => c.id === "changha")!.sign).toBe("aquarius");
    expect(signNames.aquarius.full).toBe("물병자리");
  });
});

describe("natal chart helpers", () => {
  const natal = fixture.result.natal as Parameters<typeof elementCounts>[0];
  it("counts elements and modalities over the ten planets", () => {
    expect(elementCounts(natal).reduce((sum, row) => sum + row.count, 0)).toBe(10);
    expect(modalityCounts(natal).reduce((sum, row) => sum + row.count, 0)).toBe(10);
  });
  it("lists aspects tightest first within the orb", () => {
    const aspects = natalAspects(natal);
    for (let i = 1; i < aspects.length; i++) expect(aspects[i]!.error).toBeGreaterThanOrEqual(aspects[i - 1]!.error);
    expect(aspects.every((aspect) => aspect.error <= 6)).toBe(true);
  });
});

describe("star steps", () => {
  it("falls back to enter without a reading and skips calc with one", () => {
    expect(parseStarStep("chart")).toBe("chart");
    expect(parseStarStep("bogus")).toBe("enter");
    expect(reachableStarStep("result", false)).toBe("enter");
    expect(reachableStarStep("chart", false)).toBe("enter");
    expect(reachableStarStep("calc", true)).toBe("talk-1");
    expect(reachableStarStep("chart", true)).toBe("chart");
    expect(nextStarStep("talk-3")).toBe("talk-4");
    expect(starTalkNumber("talk-4")).toBe(4);
    expect(starTalkNumber("result")).toBeNull();
  });
});
