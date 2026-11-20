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
import { firstReading, godLuck, godNotes, monthReading, pairReading, stemKeywords, stemNotes, yearReading } from "./copy";
import { sajuCharacters, sajuOpening, sajuOpeningStatus, sajuTalkLine, sajuTone } from "./lines";

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
  it("궁합: 가장 높은 칸은 같아도 모두 강조하고, 강조한 칸마다 그 칸의 설명이 한 줄씩 있다", () => {
    // 병(불)×계(물)은 서로 다른 오행이 극하는 사이: 끌림·맞춰 갈 곳이 함께 많이.
    const tied = pairReading("병", "계", 1, 1);
    const top = tied.rows.filter((row) => row.top).map((row) => row.label);
    expect(top).toEqual(["끌림", "맞춰 갈 곳"]);
    expect(tied.notes.map((note) => note.label)).toEqual(top);
    expect(tied.notes.every((note) => note.text.length > 0)).toBe(true);
    // 같은 오행은 마음 결이 가장 높고, 설명도 그 칸 하나다.
    const same = pairReading("병", "병", 0, 0);
    expect(same.notes.map((note) => note.label)).toEqual(["마음 결"]);
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

describe("열두 달·주별 칩 표시", () => {
  it("올해는 좋은 달이 한 곳 이상, 여유 둘 달이 한 곳이고 좋은 달 표시는 글의 달과 같다", () => {
    const year = yearReading(chart, at("2026-11-19"));
    const good = year.months.filter((month) => month.mark === "good").map((month) => `${month.label}월`);
    expect(good.length).toBeGreaterThan(0);
    expect(year.good.split(" · ")).toEqual(good);
    expect(year.months.filter((month) => month.mark === "rest").length).toBeLessThanOrEqual(1);
  });
  it("이달은 힘 있는 주와 쉬어 갈 주가 칩 표시와 글에 같이 나온다", () => {
    const month = monthReading(chart, at("2026-11-19"));
    const strong = month.weeks.find((week) => week.mark === "good");
    expect(strong && month.strong.startsWith(strong.range)).toBe(true);
    expect(month.weeks.every((week) => /^\d+\.\d+$/.test(week.label))).toBe(true);
  });
});

describe("첫 풀이 키워드와 최애 한마디", () => {
  const stems = Object.keys(stemNotes) as (keyof typeof stemNotes)[];
  const idols = ["changha", "elina", "yuna"] as const;

  it("조심할 것·즐거운 것은 일간 10개, 행운은 올해 관계 10개 모두 이름과 행동이 있다", () => {
    expect(Object.keys(stemKeywords)).toEqual(stems);
    expect(Object.keys(godLuck).sort()).toEqual(Object.keys(godNotes).sort());
    for (const item of [...Object.values(stemKeywords).flatMap((k) => [k.caution, k.joy]), ...Object.values(godLuck)]) {
      expect(item.name.length).toBeGreaterThan(1);
      expect(item.name.length).toBeLessThanOrEqual(10);
      expect(item.act.length).toBeLessThanOrEqual(20);
      expect(item.act).not.toMatch(/[0-9,]+원|결제|P\b/);
    }
  });

  it("같은 생일·같은 시각이면 키워드와 근거 키가 고정되고, 근거는 일간·올해 관계에서 온다", () => {
    const first = firstReading(chart, at("2026-11-19"));
    expect(first.keywords.map((k) => [k.label, k.name, k.act, k.basis])).toEqual([
      ["조심할 것", "서운함 쌓아 두기", "그날 일은 그날 털어놓기", "stemNotes.병.cautionN"],
      ["즐거운 것", "바로 말하는 응원", "좋았던 장면을 바로 댓글로 쓰기", "stemNotes.병.strengthN+fandomR"],
      ["행운", "같은 목표의 사람", "비슷한 목표인 사람에게 먼저 인사하기", "godNotes.비견.flow.1"],
    ]);
  });

  it("세 최애의 한마디는 일간마다 서로 다르고, 이름만 바꾼 문장이 없다", () => {
    for (const stem of stems) {
      const lines = idols.map((id) => sajuOpening(id, stem));
      expect(new Set(lines).size).toBe(3);
      // 말투 표시를 떼어 낸 뼈대도 겹치지 않는다(이름 치환·어미만 바꾼 문장 방지).
      const bones = lines.map((line) => line.replace(/[^가-힣]/g, "").slice(0, 8));
      expect(new Set(bones).size).toBe(3);
      for (const line of lines) {
        expect(line).not.toMatch(/창하|엘리나|유나|[0-9,]+원|결제/);
        expect(line.length).toBeLessThanOrEqual(48);
      }
    }
    expect(sajuOpening("changha", "병")).toBe("좋았으면 바로 말해. 네 댓글이 제일 먼저 보이면 좋겠어.");
    expect(sajuOpening("elina", "병")).toMatch(/요\?/);
    expect(sajuOpening("yuna", "병")).toMatch(/^오늘의 .+!/);
    expect(sajuOpening("dosa", "병")).toMatch(/오\.$/);
  });

  it("행운은 올해 관계의 flow 한 줄을 근거로 삼고, 시기를 말하는 줄은 쓰지 않는다", () => {
    for (const [relation, luck] of Object.entries(godLuck) as [keyof typeof godNotes, (typeof godLuck)[keyof typeof godLuck]][]) {
      const line = godNotes[relation].flow[luck.from];
      expect(line).toBeTruthy();
      expect(line).not.toMatch(/상반기|하반기|[0-9]+월/);
      expect(luck.act).not.toMatch(/상반기|하반기|[0-9]+월/);
    }
    expect(godLuck.상관.from).toBe(0);
    expect(godLuck.편재.from).toBe(1);
  });

  it("인물 확인 전이라 DEV 캐릭터 견본으로 표시돼 있다", () => {
    expect(sajuOpeningStatus).toBe("dev-sample");
  });
});
