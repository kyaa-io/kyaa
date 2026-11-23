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
    expect(rows[2]).toEqual({ term: "12운성", value: "태", plain: "조용히 품는 자리예요" });
    expect(rows[3].value).toBe("나무");
    expect(rows.every((row) => row.plain.length > 8)).toBe(true);
  });
  it("표에 없는 관계 이름은 합·충 없음으로 읽는다", () => {
    expect(fortuneBasis({ ...evidence, relation: "무관" })[1].value).toBe("합·충 없음");
    expect(fortuneFlow("좋은 날", { ...evidence, relation: "무관" })).toContain("평평한 날이에요.");
    expect(fortuneFlow("좋은 날", { ...evidence, relation: "무관", voice: "dosa" })).toContain("평평한 날이오.");
  });
  it("오늘의 흐름은 계산 용어 없이 오늘 들어온 기운과 내 사주와의 사이를 쉬운 말로 잇는다", () => {
    const flow = fortuneFlow("무난한 날", evidence);
    expect(flow).toContain("오늘은 돈과 기회를 다루는 기운이 들어와요.");
    expect(flow).toContain("내 사주와 오늘이 정면으로 부딪쳐 계획이 흔들리기 쉬워요.");
    expect(count(flow)).toBeGreaterThanOrEqual(3);
  });
  it("오늘의 흐름·분야 풀이·분야 근거 줄에는 일진·일간·십신·오행 묶음 용어가 없다(DF-FORT-011)", () => {
    const jargon = /일진|일간|일지|비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인|비겁|식상|재성|관성|인성/;
    for (const voice of [undefined, "changha", "elina", "yuna", "dosa"] as const)
      for (const tenGod of tenGods)
        for (const relation of ["육합", "삼합", "반합", "충", "형", "해", "원진", "복음", "없음"]) {
          const sample = { ...evidence, tenGod, relation, voice };
          for (const grade of ["쉬어 가는 날", "조심하면 괜찮은 날", "무난한 날", "좋은 날", "아주 좋은 날"])
            expect(fortuneFlow(grade, sample)).not.toMatch(jargon);
          for (const field of ["fandom", "people", "work", "rest", "love", "money"] as const) {
            const detail = fortuneFieldDetail(field, 70, sample, "highest", false);
            expect(detail.text).not.toMatch(jargon);
            expect(detail.basis).not.toMatch(jargon);
          }
        }
  });
  it("분야 풀이는 십신 열 개 × 분야 여섯 개 모두 2~4문장이고 날짜·금액을 만들지 않는다", () => {
    for (const tenGod of tenGods)
      for (const field of ["fandom", "people", "work", "rest", "love", "money"] as const)
        for (const [score, rank, shown] of [[92, "highest", true], [55, "lowest", true], [70, null, false]] as const) {
          const detail = fortuneFieldDetail(field, score, { ...evidence, tenGod }, rank, shown);
          expect(count(detail.text)).toBeGreaterThanOrEqual(2);
          expect(count(detail.text)).toBeLessThanOrEqual(4);
          expect(detail.text).not.toMatch(/[0-9]+월|[0-9]+일|[0-9,]+원/);
          expect(detail.basis).toMatch(/ 자리/);
          expect(detail.basis).not.toContain(`${score}점`);
        }
  });
});

describe("최애마다 다른 운세 본문(DF-FORT-001)", () => {
  const voices = ["changha", "elina", "yuna", "dosa"] as const;
  const fields = ["fandom", "people", "work", "rest", "love", "money"] as const;
  /** 같은 풀이를 네 최애로 만든 본문 줄(오늘의 흐름 + 분야 여섯 칸). */
  const body = (voice: (typeof voices)[number], tenGod: string, relation: string, grade: string) => [
    fortuneFlow(grade, { ...evidence, tenGod, relation, voice }),
    ...fields.map((field, i) => fortuneFieldDetail(field, [92, 55, 70, 81, 66, 74][i], { ...evidence, tenGod, relation, voice }, i === 0 ? "highest" : i === 1 ? "lowest" : null, false).text),
  ];
  it("같은 날 같은 풀이라도 네 최애의 본문 줄은 서로 하나도 같지 않고, 근거 줄은 같다", () => {
    for (const tenGod of tenGods)
      for (const relation of ["육합", "충", "없음"])
        for (const grade of ["쉬어 가는 날", "무난한 날", "아주 좋은 날"]) {
          const rows = voices.map((voice) => body(voice, tenGod, relation, grade));
          for (let line = 0; line < rows[0].length; line++)
            expect(new Set(rows.map((row) => row[line])).size).toBe(voices.length);
          const basis = voices.map((voice) => fortuneFieldDetail("money", 70, { ...evidence, tenGod, relation, voice }, null, false).basis);
          expect(new Set(basis).size).toBe(1);
        }
  });
  it("말투가 최애 태도와 맞다: 엘리나는 존댓말을 기본으로, 도사는 하오체, 유나는 느낌표 없음, 직업 비유 없음", () => {
    const all = (voice: (typeof voices)[number]) =>
      tenGods.flatMap((tenGod) => ["육합", "충", "없음"].flatMap((relation) =>
        ["쉬어 가는 날", "좋은 날"].flatMap((grade) => body(voice, tenGod, relation, grade))));
    const sentences = (voice: (typeof voices)[number]) => [...new Set(all(voice).flatMap((text) => text.split(/(?<=[.!?])\s+/)))];
    const elina = sentences("elina");
    expect(elina.filter((line) => /요[.,?]|요$|요,/.test(line)).length / elina.length).toBeGreaterThan(0.6);
    expect(sentences("dosa").every((line) => !/요[.?]$/.test(line))).toBe(true);
    expect(all("yuna").some((text) => text.includes("!"))).toBe(false);
    for (const voice of ["changha", "yuna"] as const) expect(sentences(voice).every((line) => !/요[.?]$/.test(line))).toBe(true);
    for (const voice of voices) expect(all(voice).join(" ")).not.toMatch(/촬영|대본|대사|카메라|노래|가사|악보|화장|피부|테이크/);
  });
});

describe("운세 분야 근거 줄", () => {
  it("여섯 분야의 근거가 서로 다르고 서버 점수 규칙의 자리와 같다", () => {
    const fields = ["fandom", "people", "work", "rest", "love", "money"] as const;
    const basis = fields.map((field) => fortuneFieldDetail(field, 82, { ...evidence, tenGod: "정재", relation: "형" }, null, true).basis);
    expect(new Set(basis).size).toBe(6);
    expect(basis).toEqual([
      "표현하는 기운 자리 · 표현하는 기운이 오늘 들어온 재물 기운으로 흘러가는 날",
      "나와 같은 기운 자리 · 나와 같은 기운이 오늘 들어온 재물 기운을 누르는 날",
      "책임 기운 자리 · 오늘 들어온 재물 기운이 책임 기운을 키워 주는 날",
      "채워 주는 기운 자리 · 오늘 들어온 재물 기운이 채워 주는 기운을 누르는 날",
      "연애 자리 · 내 사주와 오늘이 서로 깎임",
      "재물 기운 자리 · 오늘도 재물 기운이 들어와 힘이 겹치는 날",
    ]);
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
    expect(tarotRowMore(36, "연애")).toBe("마음의 카드라 느낀 것을 말로 건네면 닿아요.");
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
