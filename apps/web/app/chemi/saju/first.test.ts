import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { calculateSaju } from "@/server/chemi-engine/saju";
import { flowRelations, type Chart } from "./chart";
import {
  elementView,
  relationRows,
  scopeLabel,
  sheetColumns,
  sheetDetail,
  strengthView,
  tenGodView,
  termNote,
  yearFlowView,
} from "./first";

// 2026-11-23 정오(KST). 사주 해는 丙午년.
const at = Date.parse("2026-11-23T12:00:00+09:00");
const chartOf = (input: { year: number; month: number; day: number; hour: number | null; minute?: number | null }) =>
  calculateSaju({ ...input, isLunar: false, gender: "female" } as Parameters<typeof calculateSaju>[0]) as unknown as Chart;

const full = chartOf({ year: 1999, month: 9, day: 23, hour: 21, minute: 10 });
const noTime = chartOf({ year: 1999, month: 9, day: 23, hour: null });
const term = chartOf({ year: 2001, month: 2, day: 4, hour: null });

describe("사주 첫 풀이 블록", () => {
  it("명식표 네 기둥이 엔진 값과 같다(시·일·월·연)", () => {
    const columns = sheetColumns(full);
    expect(columns.map((column) => (column.known ? column.stem.hanja + column.branch.hanja : "?"))).toEqual(["壬戌", "戊寅", "癸酉", "己卯"]);
    const day = columns[1];
    expect(day.known && day.me && day.stemGod).toBe("일간");
    expect(columns.map((column) => column.known && column.lifeStage)).toEqual(["묘", "장생", "사", "목욕"]);
  });

  it("올해 흐름이 함수가 돌려주는 합·충을 빠짐없이 근거로 든다(寅午戌 삼합, 丙–壬 천간충)", () => {
    const kinds = flowRelations(full, { heavenlyStem: "병", earthlyBranch: "오" }).map((item) => `${item.kind}:${item.letters}`);
    expect(kinds).toContain("삼합:인오술");
    expect(kinds).toContain("천간충:임병");
    expect(kinds).not.toContain("반합:인오");
    const rows = yearFlowView(full, at).rows.map((row) => `${row.term}|${row.value}`);
    expect(rows).toContain("지지 午|일지 寅 · 시지 戌과 삼합(불)");
    expect(rows).toContain("천간 丙|시간 壬과 충");
  });

  it("시간 모름은 시주 없이 확인한 글자로만 말한다", () => {
    expect(scopeLabel(noTime)).toBe("여섯 글자 기준");
    const year = yearFlowView(noTime, at).rows;
    expect(year[0].plain).toMatch(/^확인한 여섯 글자에는 없던 불이 들어와요/);
    expect(year.map((row) => row.value).join()).not.toMatch(/삼합|시간 壬/);
    expect(elementView(noTime).summary[1].plain).toMatch(/^겉에 드러난 여섯 글자에는 불이 없어요/);
    expect(sheetColumns(noTime)[0].known).toBe(false);
  });

  it("절기 날 + 시간 모름은 월주를 쓰는 블록을 잠그고 사유를 한 번 적는다", () => {
    expect(term.pillars.month).toBeNull();
    expect(strengthView(term)).toBeNull();
    expect(termNote(term)).toBe("2001.02.04는 입춘 날이에요. 오전 3시 29분 앞뒤로 연주와 월주가 달라져서, 아래 네 풀이는 시간을 알면 열려요.");
    expect(termNote(full)).toBeNull();
  });

  it("신강·십신·합충 문장이 글자를 지목한다", () => {
    const strength = strengthView(full)!;
    expect([strength.index, strength.class, strength.helpers, strength.drainers]).toEqual([32, "신약", 2, 5]);
    expect(strength.rows[0].plain).toBe("戌 · 己가 일간 戊를 돕고, 나머지 다섯 글자는 힘을 가져가요");
    expect(strength.rows[2].value).toBe("불 火 · 흙 土");
    expect(tenGodView(full).rows.map((row) => row.value)).toEqual(["비겁 · 재성 · 관성 2개씩", "인성 0"]);
    expect(relationRows(full).map((row) => `${row.kind} ${row.where}`)).toEqual([
      "천간합 일간 戊 – 월간 癸",
      "육합 시지 戌 – 연지 卯",
      "충 월지 酉 – 연지 卯",
    ]);
    expect(sheetDetail(full).void.plain).toBe("월지 酉가 공망이에요. 그 자리의 힘은 조금 덜어서 읽어요");
  });
});
