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
    expect(moon).toMatchObject({ title: "달과 내 달", aspect: "삼각", domain: "overall", up: true });
    expect(moon!.when).toMatch(/^오늘 .+ \d+시쯤 가장 강해요$/);
    expect(uranus!.title).toBe("천왕성과 내 수성");
    expect(uranus!.when).toBe("12월 12일(토)까지");
    expect(moon!.text).toBe("달은 내 달(게자리)과 부드럽게 이어지다 한 발 멀어지고 있어요. 받던 도움이 조금씩 옅어져요.");
    expect(uranus!.text).toBe("천왕성은 내 수성(쌍둥이자리)과 겹쳐서 부담을 줘요. 작은 일에 마음이 쓰일 수 있어요.");
  });

  it("labels help and pressure by the aspect, not by the score sign", () => {
    const base = { body: "Venus", target: "Venus", hour: 9, exitDate: "2026-11-27" };
    const view = (angle: number, applying: boolean, score: number) => reasonView({ ...base, angle, applying, score }, () => null, "2026-11-22");
    expect(view(60, false, -0.4)).toMatchObject({ aspect: "육분", up: true, tone: "받던 도움이 조금씩 옅어져요." });
    expect(view(120, true, 0.9)).toMatchObject({ up: true, tone: "마음을 꺼내기 쉬운 때예요." });
    expect(view(90, false, 0.5)).toMatchObject({ aspect: "사각", up: false, tone: "눌리던 것이 조금씩 가벼워져요." });
    expect(view(90, false, 0.5).text).toContain("부딪친 뒤 풀려 가요");
    expect(view(180, true, -0.8)).toMatchObject({ up: false, tone: "말이 날카롭게 들릴 수 있어요." });
    expect(view(0, true, 0.8).up).toBe(true);
    expect(view(0, false, -0.8).up).toBe(false);
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

describe("별자리 4/4 궁합 줄", () => {
  it("받침에 맞춰 '이랑/랑'을 붙이고, 총운 별이 셋 이하면 하루 전체를 좋다고 하지 않는다", async () => {
    const { starPairLine } = await import("./copy");
    const calm = starPairLine("yuna", "쌍둥이", "물병", false, 2);
    expect(calm).toContain("물병이랑 쌍둥이");
    expect(calm).not.toContain("하고 싶은 말 있으면 오늘 바로 해");
    expect(starPairLine("yuna", "쌍둥이", "물병", false, 5)).toContain("하고 싶은 말 있으면 오늘 바로 해");
    expect(starPairLine("changha", "게", "물병", false, 2)).toContain("물병과 게");
    // 좋은 날의 맺음은 최애마다 자기 활동 분야로 다르다.
    expect(starPairLine("changha", "게", "물병", false, 5)).toContain("내가 너 응원하기 딱 좋은 날");
    expect(starPairLine("elina", "게", "물병", false, 5)).toContain("내가 더 챙겨 줄게요");
  });
});

describe("별자리 첫 대사 별명", () => {
  it("별명이 있으면 그 이름으로 부르며 시작하고, 없으면 그대로다(운세와 같은 규칙)", async () => {
    const { starEnterLine } = await import("./copy");
    expect(starEnterLine("changha", "enter", "별빛토끼")).toBe("별빛토끼, 오늘 밤하늘이 너한테 뭐라는지 볼래? 칭찬이면 좋겠다.");
    expect(starEnterLine("dosa", "birth", "별빛토끼")).toMatch(/^별빛토끼 님, /);
    expect(starEnterLine("yuna")).toBe("오늘 밤하늘이 뭐라는지 콕 집어 줄게.");
  });
});
