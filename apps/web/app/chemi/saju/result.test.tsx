import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Chart } from "./chart";
import { SajuResult, type ResultView } from "./result";

vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnBadge: () => <b>+3</b> }));

const chart: Chart = {
  pillars: {
    year: { heavenlyStem: "무", earthlyBranch: "인" },
    month: { heavenlyStem: "을", earthlyBranch: "묘" },
    day: { heavenlyStem: "병", earthlyBranch: "오" },
    hour: null,
  },
  timeKnown: false,
  termBoundary: false,
  locked: [],
  lockReason: null,
  solarTerm: null,
};
const handlers = {
  onBack: vi.fn(),
  onShare: vi.fn(),
  onTopics: vi.fn(),
  onGo: vi.fn(),
  onScene: vi.fn(),
  onPair: vi.fn(),
  onBirthTime: vi.fn(),
};
const show = (view: ResultView, extra: Partial<Parameters<typeof SajuResult>[0]> = {}) =>
  render(
    <SajuResult
      locale="ko"
      character="changha"
      view={view}
      chart={chart}
      at={Date.parse("2026-11-19T03:00:00Z")}
      points={3}
      exp={20}
      sharing={false}
      backHref="/chemi/saju"
      pair={{ name: "민지", result: { dayStems: ["병", "계"], combinations: [], clashes: [] }, timeKnown: false }}
      {...handlers}
      {...extra}
    />,
  );

it("처음 풀이: 한 줄 제목·타고난 기운·성격·올해 흐름, 질문하기·가격은 없다", () => {
  const { container } = show("first");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("한낮의 해처럼, 좋아하는 걸 숨기지 않는 사람");
  for (const label of ["타고난 기운", "타고난 성격", "올해 흐름", "강점", "조심할 점"])
    expect(screen.getByText(label)).toBeTruthy();
  expect(container.textContent).not.toMatch(/질문하기|원\b|1,900|결제/);
  fireEvent.click(screen.getByRole("button", { name: /^올해/ }));
  expect(handlers.onGo).toHaveBeenCalledWith("year");
});

it("시간을 모르고 절기 날이면 잠긴 칸에 시간 넣기 길을 둔다", () => {
  show("first", { chart: { ...chart, locked: ["personality", "fiveElements"], lockReason: "시간을 알면 열려요" } });
  fireEvent.click(screen.getByRole("button", { name: "태어난 시간 넣기" }));
  expect(handlers.onBirthTime).toHaveBeenCalled();
  expect(screen.queryByText("타고난 성격")).toBeNull();
});

it("올해·이달·궁합은 각자 제목과 다른 주제·다른 사람과 버튼을 가진다", () => {
  show("year");
  expect(screen.getByText("열두 달")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "다른 주제" }).length).toBeGreaterThan(0);
});
it("이달 풀이", () => {
  show("month");
  expect(screen.getByText("주별 흐름")).toBeTruthy();
});
it("궁합: 상대 이름과 시간 없이 봄 표시, 두 문장 고지", () => {
  const { container } = show("pair");
  expect(screen.getByText("민지 출생 시간 없이 봄")).toBeTruthy();
  expect(screen.getByText("나 × 민지")).toBeTruthy();
  expect(container.textContent).toContain("실제 두 사람의 관계를 단정하지 않아요.");
  expect(screen.getAllByRole("button", { name: "다른 사람과" }).length).toBeGreaterThan(0);
});
