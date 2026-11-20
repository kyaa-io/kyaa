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
      pair={{ id: "pair-1", name: "민지", result: { dayStems: ["병", "계"], combinations: [], clashes: [] }, timeKnown: false }}
      {...handlers}
      {...extra}
    />,
  );

it("처음 풀이: 한 줄 제목·타고난 기운·성격·올해 흐름, 질문하기·가격은 없다", () => {
  const { container } = show("first");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("한낮의 해처럼, 좋아하는 걸 숨기지 않는 사람");
  for (const label of ["타고난 기운", "타고난 성격", "올해 흐름", "강점", "조심할 것"])
    expect(screen.getByText(label)).toBeTruthy();
  expect(container.textContent).not.toMatch(/질문하기|원\b|1,900|결제/);
  // 조심할 것은 제목 아래 키워드 한 곳에만 둔다.
  expect(screen.queryByText("조심할 점")).toBeNull();
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
it("올해 열두 달은 숫자 칩 12개이고 좋은 달·여유 둘 달이 표시로 구분된다", () => {
  const { container } = show("year");
  const chips = [...container.querySelectorAll("ol li[data-row]")];
  expect(chips).toHaveLength(12);
  expect(chips.filter((chip) => chip.getAttribute("data-mark") === "good").length).toBeGreaterThan(0);
  expect(chips.filter((chip) => chip.getAttribute("data-mark") === "rest")).toHaveLength(1);
  expect(chips.filter((chip) => chip.hasAttribute("data-current"))).toHaveLength(1);
  // 색만으로 구분하지 않는다: 표시된 칩은 읽어 주는 이름도 가진다.
  expect(container.querySelector('[data-mark="good"]')?.textContent).toContain("좋은 달");
  expect(container.querySelector('[data-mark="rest"]')?.textContent).toContain("여유 둘 달");
});
it("이달 풀이", () => {
  const { container } = show("month");
  expect(screen.getByText("주별 흐름")).toBeTruthy();
  const chips = [...container.querySelectorAll("ol li[data-row]")];
  expect(chips.length).toBeGreaterThanOrEqual(4);
  expect(container.querySelector('[data-mark="good"]')?.textContent).toContain("힘 있는 주");
  expect(container.querySelector('[data-mark="rest"]')?.textContent).toContain("쉬어 갈 주");
});
it("궁합: 상대 이름과 시간 없이 봄 표시, 두 문장 고지", () => {
  const { container } = show("pair");
  expect(screen.getByText("민지 출생 시간 없이 봄")).toBeTruthy();
  expect(screen.getByText("나 × 민지")).toBeTruthy();
  expect(container.textContent).toContain("실제 두 사람의 관계를 단정하지 않아요.");
  expect(screen.getAllByRole("button", { name: "다른 사람과" }).length).toBeGreaterThan(0);
});

it("처음 풀이 제목 아래: 최애마다 다른 한마디, 같은 키워드 세 칸", () => {
  const seen = (["changha", "elina", "yuna"] as const).map((character) => {
    const { container, unmount } = show("first", { character });
    const opening = container.querySelector("header p:nth-of-type(2)")?.textContent;
    const keywords = [...container.querySelectorAll("[data-keyword]")].map((row) => row.textContent);
    unmount();
    return { opening, keywords };
  });
  expect(new Set(seen.map((item) => item.opening)).size).toBe(3);
  expect(seen[0].keywords).toEqual([
    "조심할 것서운함 쌓아 두기그날 일은 그날 털어놓기",
    "즐거운 것바로 말하는 응원좋았던 장면을 바로 댓글로 쓰기",
    "행운같은 목표의 사람비슷한 목표인 사람에게 먼저 인사하기",
  ]);
  expect(seen[1].keywords).toEqual(seen[0].keywords);
  expect(seen[2].keywords).toEqual(seen[0].keywords);
});

it("올해·이달·궁합에는 한마디와 키워드를 두지 않는다", () => {
  for (const view of ["year", "month", "pair"] as const) {
    const { container, unmount } = show(view);
    expect(container.querySelector("[data-keyword]")).toBeNull();
    unmount();
  }
});
