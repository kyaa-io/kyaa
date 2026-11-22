import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { answerFollowup, askEvidence } = await import("./answer");

const at = Date.parse("2026-11-22T03:00:00Z");
const chart = { pillars: { year: null, month: null, day: { heavenlyStem: "병", earthlyBranch: "오" }, hour: null }, locked: [], timeKnown: false };
const fortune = {
  score: 86,
  grade: { name: "좋은 날" },
  fields: { fandom: 92, people: 88, work: 61, rest: 70, love: 55, money: 78 },
  evidence: { dayPillar: "경자", yearPillar: "병오", relation: "충", stage: "태", spirit: "재살", tenGod: "편재", useful: "목", timeBasis: "시주 포함" },
};
const star = {
  stars: { overall: 2, love: 4, people: 3, money: 5, work: 1 },
  reasons: [{ body: "Venus", target: "Moon", angle: 120, hour: 10, applying: true, score: 1.2, exitDate: "2026-11-24" }],
};
const tarot = { cards: [{ card: 23, reversed: true }] };

describe("질문하기 근거 한 줄", () => {
  it("사주: 올해는 세운, 이번 달 주제는 월운의 십신을 말한다", () => {
    expect(askEvidence("saju", "free", chart, undefined, at)?.ban).toBe("올해 병오년은 네 일간에게 비견이야. 비견은 '나와 같은 기운'이라는 뜻이야.");
    expect(askEvidence("saju", "month", chart, undefined, at)?.hao).toBe("이달 기해월은 그대 일간에게 상관이오. 상관은 '내가 내보내는 기운'이라는 뜻이오.");
  });
  it("운세: 그날 일진과 십신을 말하고, 받침 없는 십신은 맺음말이 다르다", () => {
    expect(askEvidence("fortune", "money", fortune, "daily", at)?.yo).toBe("오늘 일진 경자는 일간에게 편재예요. 편재는 '움직이는 재물 기운'이라는 뜻이에요.");
    expect(askEvidence("fortune", "money", fortune, "tomorrow", at)?.ban).toContain("내일 일진 경자는 네 일간에게 편재야.");
    expect(askEvidence("fortune", "money", { days: [] }, "week", at)).toBeNull();
  });
  it("별자리는 가장 센 행성 각도, 타로는 카드 종류를 말한다", () => {
    expect(askEvidence("star", "love", star, "daily", at)?.ban).toBe("오늘 금성이 네 달과 삼각 각도야.");
    expect(askEvidence("tarot", "love", tarot, "daily", at)?.yo).toBe("완드 2 카드는 마이너 아르카나 완드(불)예요.");
  });
  it("'왜 그렇게 나왔어?'에 근거 줄을 넣어 답하고, 같은 입력이면 같은 답이다", () => {
    const input = { character: "changha", content: "saju", topic: "month", question: "왜 그렇게 나왔어?", result: chart, at } as const;
    const answer = answerFollowup(input);
    // 첫 답의 문장은 되풀이하지 않고, 근거로 댄 십신(상관 = 밖으로 꺼내는 기운)에서 결론을 끌어낸다.
    expect(answer.split("\n")).toHaveLength(2);
    expect(answer).toMatch(/(보여 줄수록 풀려|앞서 나가기 쉬운 기운이야)/);
    expect(answer).toContain("이달 기해월은 네 일간에게 상관이야.");
    expect(answerFollowup(input)).toBe(answer);
    // 까닭을 묻지 않은 말에는 근거 줄을 덧붙이지 않는다.
    expect(answerFollowup({ ...input, question: "하나만 더 알려 줘" })).not.toContain("기해월");
  });
});
