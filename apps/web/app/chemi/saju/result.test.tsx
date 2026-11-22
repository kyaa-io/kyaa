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
  onAsk: vi.fn(),
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
      pair={{ id: "pair-1", name: "민지", result: { dayStems: ["병", "계"], combinations: [], clashes: [] }, timeKnown: false }}
      {...handlers}
      {...extra}
    />,
  );

it("처음 풀이: 한 줄 제목·명식표·오행·신강·십신·합충·올해 흐름, 가격은 없다", () => {
  const { container } = show("first");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("한낮의 해처럼, 좋아하는 걸 숨기지 않는 사람");
  expect(container.textContent).toContain("丙火 · 병화 일간");
  for (const label of ["사주 여덟 글자", "타고난 기운", "타고난 성격", "신강 · 신약", "십신 분포", "합 · 충", "올해 흐름", "강점", "조심할 것", "조심할 점"])
    expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByRole("img", { name: "사주 여덟 글자. 시주 모름, 일주 병오, 월주 을묘, 연주 무인" })).toBeTruthy();
  expect(container.textContent).not.toMatch(/원\b|1,900|결제/);
  fireEvent.click(screen.getByRole("button", { name: /^올해/ }));
  expect(handlers.onGo).toHaveBeenCalledWith("year");
});

it("명식표 자세히는 같은 화면 안에서 펼치고 접는다", () => {
  const { container } = show("first");
  const toggle = screen.getByRole("button", { name: /자세히/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.textContent).not.toContain("12운성");
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: /접기/ }).getAttribute("aria-expanded")).toBe("true");
  expect(container.textContent).toContain("12운성");
  expect(container.textContent).toContain("계산 기준");
  expect(handlers.onGo).not.toHaveBeenCalledWith("first");
});

it("시간을 모르고 절기 날이면 확실한 글자만 열고 네 블록은 자물쇠로 잠근다", () => {
  const { container } = show("first", {
    chart: {
      ...chart,
      pillars: { ...chart.pillars, month: null },
      termBoundary: true,
      locked: ["personality", "fiveElements", "majorLuck", "career"],
      lockReason: "시간을 알면 열려요",
      solarTerm: { name: "입춘", at: "2001-02-03T18:29:00.000Z" },
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "태어난 시간 넣기" }));
  expect(handlers.onBirthTime).toHaveBeenCalled();
  expect(screen.getByText("타고난 성격")).toBeTruthy();
  expect(screen.getAllByRole("img", { name: "태어난 시간을 알면 열려요" })).toHaveLength(4);
  // 잠긴 신강 자리에는 점수도 분모도 없다.
  expect(container.textContent).not.toContain("/ 100");
  expect(screen.queryByRole("button", { name: /자세히/ })).toBeNull();
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
    const opening = container.querySelector("header p:nth-of-type(3)")?.textContent;
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

it("승인된 사주 풀이에는 견본 표시가 없다", () => {
  const first = show("first");
  expect(first.queryByText("DEV 견본 대사 · 본인 확인 전")).toBeNull();
  first.unmount();
  for (const view of ["year", "month", "pair"] as const) {
    const { container, unmount } = show(view);
    expect(container.querySelector("[data-opening-status]")).toBeNull();
    unmount();
  }
});

it("올해·이달·궁합에는 한마디와 키워드를 두지 않는다", () => {
  for (const view of ["year", "month", "pair"] as const) {
    const { container, unmount } = show(view);
    expect(container.querySelector("[data-keyword]")).toBeNull();
    unmount();
  }
});

it("주 버튼은 이 결과로 질문하기이고 자랑하기는 보조다. 궁합 풀이의 주 버튼은 자랑하기다", () => {
  const { unmount } = show("first");
  fireEvent.click(screen.getAllByRole("button", { name: "이 결과로 질문하기" })[0]);
  expect(handlers.onAsk).toHaveBeenCalled();
  // 보조 행동은 한 줄: 자랑하기 · 다른 놀이 보기. 저장과 장면 다시 보기는 자랑하기 판 안에 있다.
  const row = document.querySelector("[data-result-actions]")!;
  expect([...row.children].map((item) => item.textContent)).toEqual(["자랑하기", "다른 놀이 보기"]);
  expect(screen.queryByRole("button", { name: "조언 이미지 저장" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "자랑하기" })[0]);
  expect(handlers.onShare).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "조언 이미지 저장" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "장면 다시 보기" }));
  expect(handlers.onScene).toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "자랑하기" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
  expect(handlers.onShare).toHaveBeenCalledWith("copy");
  unmount();
  show("pair");
  expect(screen.queryByRole("button", { name: "이 결과로 질문하기" })).toBeNull();
  expect([...document.querySelector("[data-result-actions]")!.children].map((item) => item.textContent)).toEqual(["다른 사람과", "다른 놀이 보기"]);
});
