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

  it("keeps the default page-level heading when not inline", () => {
    render(<FanState kind="empty" title="비었어요." />);
    expect(screen.getByRole("heading", { name: "비었어요." })).toBeInTheDocument();
  });
});
