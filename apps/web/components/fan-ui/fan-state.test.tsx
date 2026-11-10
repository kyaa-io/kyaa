import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FanState } from "./fan-state";

describe("FanState", () => {
  it("announces loading without presenting a false heading", () => {
    render(<FanState kind="loading" title="Passport를 불러오는 중이에요." />);
    const state = screen.getByRole("status");
    expect(state).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("compact inline state keeps its title as a paragraph and its action in the same section", () => {
    render(<FanState inline compact kind="error" title="순위를 불러오지 못했어요" actions={<button type="button">다시 시도</button>} />);
    const state = screen.getByRole("alert");
    expect(state.className).toMatch(/compact/);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(state).toContainElement(screen.getByRole("button", { name: "다시 시도" }));
  });

  it("announces an actionable error assertively", () => {
    render(
      <FanState
        kind="error"
        title="혜택을 불러오지 못했어요."
        actions={<button type="button">다시 시도</button>}
      />,
    );
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("renders an inline error as an alert paragraph without a heading or fixed height", () => {
    render(<FanState inline kind="error" title="불러오지 못했어요." actions={<button type="button">다시 시도</button>} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("불러오지 못했어요.").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("renders a section empty state as one sentence with no heading, icon or action (C6·C8)", () => {
    const { container } = render(<FanState kind="empty" title="진행 중인 럭키드로우가 없어요." />);
    const state = screen.getByRole("status");
    expect(state).toHaveAttribute("data-empty-state", "section");
    expect(state.className).toMatch(/section/);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("진행 중인 럭키드로우가 없어요").tagName).toBe("P");
    expect(container.querySelectorAll("svg, button, a")).toHaveLength(0);
  });

  it("renders exactly one link action in a section empty state and keeps the one-sentence structure", () => {
    const { container } = render(<FanState kind="empty" title="응모 내역이 없습니다" action={{ label: "혜택 둘러보기", href: "/benefits" }} />);
    const state = screen.getByRole("status");
    expect(state).toHaveAttribute("data-empty-state", "section");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelectorAll("a, button")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "혜택 둘러보기" })).toHaveAttribute("href", "/benefits");
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("renders exactly one link action in a section empty state and keeps the one-sentence structure", () => {
    const { container } = render(<FanState kind="empty" title="응모 내역이 없습니다" action={{ label: "혜택 둘러보기", href: "/benefits" }} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-empty-state", "section");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelectorAll("a, button")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "혜택 둘러보기" })).toHaveAttribute("href", "/benefits");
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("rejects icon, description and actions on a section empty state at the type level", () => {
    // @ts-expect-error 구역 안 빈 상태는 행동을 받지 않는다.
    render(<FanState kind="empty" title="비었어요" actions={<button type="button">x</button>} />);
    // @ts-expect-error 구역 안 빈 상태는 아이콘을 받지 않는다.
    render(<FanState kind="empty" title="비었어요" icon={<svg />} />);
    // @ts-expect-error 구역 안 빈 상태는 설명 문장을 받지 않는다.
    render(<FanState kind="empty" title="비었어요" description="설명" />);
  });

  it("has no page scope: an empty page is the same one 78px line (gate D2, 2026-11-09)", () => {
    // @ts-expect-error scope 속성은 없다. 페이지 전체 빈 상태도 한 줄 한 문장이다.
    render(<FanState kind="empty" scope="page" title="비었어요." />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-empty-state", "section");
  });
});
