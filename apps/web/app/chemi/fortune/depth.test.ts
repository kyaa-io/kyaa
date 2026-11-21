import { describe, expect, it } from "vitest";
import { tenGods } from "../saju/chart";
import { TAROT_DECK_SIZE } from "@/features/chemi/tarot/deck";
import { tarotBasis, tarotRowMore } from "@/features/chemi/tarot/depth";
import { domains, starDomainText, zodiacSigns } from "../star/copy";
import { fortuneBasis, fortuneFieldDetail, fortuneFlow, type FortuneEvidence } from "./depth";

const evidence: FortuneEvidence = {
  dayPillar: "경자", yearPillar: "병오", relation: "충", stage: "태", tenGod: "편재", useful: "목", timeBasis: "시주 포함",
};
const count = (text: string) => text.split(/(?<=[.!?])\s+/).length;

describe("운세 근거와 분야별 풀이", () => {
  it("근거 줄은 일진·십신·일지와의 관계·12운성·도움 기운을 용어와 쉬운 풀이로 적는다", () => {
    const rows = fortuneBasis(evidence);
    expect(rows.map((row) => row.term)).toEqual(["일진", "일지와 일진", "12운성", "도움 기운", "세운", "계산 기준"]);
    expect(rows[0].value).toBe("경자일 · 편재");
    expect(rows[1].value).toBe("충");
    expect(rows[3].value).toBe("나무");
    expect(rows.every((row) => row.plain.length > 8)).toBe(true);
  });
  it("표에 없는 관계 이름은 합·충 없음으로 읽는다", () => {
    expect(fortuneBasis({ ...evidence, relation: "무관" })[1].value).toBe("합·충 없음");
    expect(fortuneFlow("좋은 날", { ...evidence, relation: "무관" })).toContain("평평한 날이에요.");
  });
  it("오늘의 흐름은 일진과 십신을 넣어 2~3문장이다", () => {
    const flow = fortuneFlow("무난한 날", evidence);
    expect(flow).toContain("오늘 일진은 경자, 내 일간에게는 편재, 움직이는 재물 기운으로 와요.");
    expect(count(flow)).toBeGreaterThanOrEqual(3);
  });
  it("분야 풀이는 십신 열 개 × 분야 여섯 개 모두 2~4문장이고 날짜·금액을 만들지 않는다", () => {
    for (const tenGod of tenGods)
      for (const field of ["fandom", "people", "work", "rest", "love", "money"] as const)
        for (const [score, rank, shown] of [[92, "highest", true], [55, "lowest", true], [70, null, false]] as const) {
          const detail = fortuneFieldDetail(field, score, { ...evidence, tenGod }, rank, shown);
          expect(count(detail.text)).toBeGreaterThanOrEqual(2);
          expect(count(detail.text)).toBeLessThanOrEqual(4);
          expect(detail.text).not.toMatch(/[0-9]+월|[0-9]+일|[0-9,]+원/);
          expect(detail.basis).toBe(`${score}점 · 일진 경자 ${tenGod}`);
        }
  });
});

describe("타로 근거", () => {
  it("카드 78장 모두 종류와 방향 줄이 있고, 마이너는 숫자나 인물 줄이 하나 더 있다", () => {
    for (let id = 0; id < TAROT_DECK_SIZE; id++) {
      const rows = tarotBasis(id, false);
      expect(rows).toHaveLength(id < 22 ? 2 : 3);
      expect(rows.at(-1)!.value).toBe("정방향");
    }
    expect(tarotBasis(0, true).map((row) => row.value)).toEqual(["메이저 아르카나 0번", "역방향"]);
    expect(tarotBasis(24, false).map((row) => row.value)).toEqual(["마이너 아르카나 · 완드(불)", "3", "정방향"]);
    expect(tarotBasis(77, false)[1]).toMatchObject({ term: "인물", value: "왕" });
    expect(tarotBasis(78, false)).toEqual([]);
  });
  it("연애·일·돈 줄에만 무늬 문장을 덧붙인다", () => {
    expect(tarotRowMore(36, "연애")).toBe("마음의 무늬라 느낀 것을 말로 건네면 닿아요.");
    expect(tarotRowMore(36, "조언")).toBeNull();
  });
});

describe("별자리 영역 풀이", () => {
  it("오늘 별점 풀이 뒤에 내 행성이 놓인 별자리를 근거로 한 문장을 잇는다", () => {
    expect(starDomainText("love", 4, () => "aries")).toBe(
      "먼저 건넨 인사가 잘 돌아와요. 연락하고 싶은 사람이 있으면 가볍게 시작해요. 내 금성(애정)이 양자리라 좋아하면 바로 표현하는 편이에요.",
    );
    for (const domain of domains)
      for (const sign of zodiacSigns)
        for (const stars of [1, 2, 3, 4, 5]) {
          const sentences = count(starDomainText(domain, stars, () => sign));
          expect(sentences).toBeGreaterThanOrEqual(2);
          expect(sentences).toBeLessThanOrEqual(4);
        }
  });
});
