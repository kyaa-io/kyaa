import { describe, expect, it } from "vitest";
import {
  dayPillarAt,
  elementCounts,
  helpingElement,
  monthSpanAt,
  seasonAt,
  tenGod,
  type Chart,
} from "./chart";
import { firstReading, godNotes, monthReading, pairReading, stemNotes, yearReading } from "./copy";
import { sajuCharacters, sajuTalkLine, sajuTone } from "./lines";

const at = (iso: string) => Date.parse(`${iso}T03:00:00Z`);
const chart: Chart = {
  pillars: {
    year: { heavenlyStem: "무", earthlyBranch: "인" },
    month: { heavenlyStem: "을", earthlyBranch: "묘" },
    day: { heavenlyStem: "병", earthlyBranch: "오" },
    hour: { heavenlyStem: "기", earthlyBranch: "미" },
  },
  timeKnown: true,
  termBoundary: false,
  locked: [],
  lockReason: null,
  solarTerm: null,
};

describe("사주 계산", () => {
  it("2026-11-19 일진은 정유(기준 1900-01-01 갑술)", () => {
    expect(dayPillarAt(at("2026-11-19"))).toEqual({ heavenlyStem: "정", earthlyBranch: "유" });
  });
  it("입춘 전에는 지난 해 간지, 입춘 뒤에는 올해 간지", () => {
    expect(seasonAt(at("2026-01-20")).yearPillar).toEqual({ heavenlyStem: "을", earthlyBranch: "사" });
    expect(seasonAt(at("2026-11-19")).yearPillar).toEqual({ heavenlyStem: "병", earthlyBranch: "오" });
  });
  it("2026-11-19 월건은 입동~대설 사이의 기해월", () => {
    const span = monthSpanAt(at("2026-11-19"));
    expect(span.pillar).toEqual({ heavenlyStem: "기", earthlyBranch: "해" });
    expect(span.month).toBe(11);
    expect(span.nextTerm).toBe("대설");
  });
  it("십신: 병 일간 기준", () => {
    expect(tenGod("병", "병")).toBe("비견");
    expect(tenGod("병", "정")).toBe("겁재");
    expect(tenGod("병", "무")).toBe("식신");
    expect(tenGod("병", "경")).toBe("편재");
    expect(tenGod("병", "임")).toBe("편관");
    expect(tenGod("병", "갑")).toBe("편인");
  });
  it("오행 개수는 있는 기둥의 글자만 센다", () => {
    const counts = elementCounts(chart);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(8);
    const unknown = { ...chart, pillars: { ...chart.pillars, hour: null } };
    expect(Object.values(elementCounts(unknown)).reduce((a, b) => a + b, 0)).toBe(6);
    expect(["wood", "fire", "earth", "metal", "water"]).toContain(helpingElement(chart));
  });
});

describe("풀이 문장", () => {
  it("일간 열 개와 십신 열 개가 모두 문장을 가진다", () => {
    expect(Object.keys(stemNotes)).toHaveLength(10);
    expect(Object.keys(godNotes)).toHaveLength(10);
  });
  it("같은 사주표와 시각이면 같은 풀이", () => {
    const now = at("2026-11-19");
    expect(firstReading(chart, now)).toEqual(firstReading(chart, now));
    expect(firstReading(chart, now).headline).toBe("한낮의 해처럼, 좋아하는 걸 숨기지 않는 사람");
    expect(firstReading(chart, now).rows.map((row) => row.count)).toEqual([3, 2, 3, 0, 0]);
    expect(firstReading(chart, now).rows.filter((row) => row.top).map((row) => row.name)).toEqual(["나무", "흙"]);
  });
  it("올해 풀이는 열두 달을 가지고 입춘 전에는 안내 표시", () => {
    expect(yearReading(chart, at("2026-11-19")).months).toHaveLength(12);
    expect(yearReading(chart, at("2026-11-19")).beforeSpring).toBe(false);
    expect(yearReading(chart, at("2026-01-20")).beforeSpring).toBe(true);
  });
  it("이달 풀이는 이달 끝나는 절기와 주별 흐름을 가진다", () => {
    const month = monthReading(chart, at("2026-11-19"));
    expect(month.name).toBe("이달 · 11월");
    expect(month.nextTerm).toContain("대설");
    expect(month.weeks.filter((week) => week.current)).toHaveLength(1);
  });
  it("궁합: 오행이 낳는 사이는 서로 채움이 많이, 합·충은 끌림·맞춰 갈 곳을 올린다", () => {
    const gives = pairReading("갑", "병", 0, 0);
    expect(gives.rows[0].level).toBe("많이");
    const clashing = pairReading("병", "계", 0, 1);
    expect(clashing.rows.find((row) => row.label === "맞춰 갈 곳")?.level).toBe("많이");
    expect(pairReading("병", "병", 1, 0).rows).toHaveLength(4);
  });
});

describe("대화 줄", () => {
  const input = {
    image: "한낮의 해",
    trait: "좋아하는 걸 숨기지 않는",
    strengthN: "좋아하는 마음을 바로 말로 꺼내는 것",
    cautionN: "서운한 일을 오래 담아 두는 것",
    bond: "같이 있으면 대화가 끊이지 않는 사이",
    yearTitle: "숨겨 둔 재주가 드러나는 해",
  };
  it("최애 네 명 모두 1~4번 줄과 입장·계산 줄이 있다", () => {
    for (const { id } of sajuCharacters) {
      const tone = sajuTone(id);
      expect(tone.hello && tone.birth && tone.calc && tone.again).toBeTruthy();
      for (const n of [1, 2, 3, 4] as const) expect(sajuTalkLine(id, n, input).length).toBeGreaterThan(10);
    }
  });
  it("창하는 반말, 도사는 하오체", () => {
    expect(sajuTalkLine("changha", 1, input)).toBe("넌 한낮의 해 같은 사람이야. 좋아하는 걸 숨기지 않는 사람이지.");
    expect(sajuTalkLine("dosa", 3, input)).toBe("올해는 숨겨 둔 재주가 드러나는 해요.");
  });
  it("대화 줄에 돈·가격 이야기를 넣지 않는다", () => {
    for (const { id } of sajuCharacters)
      for (const n of [1, 2, 3, 4] as const) expect(sajuTalkLine(id, n, input)).not.toMatch(/원|결제|P\b/);
  });
});
