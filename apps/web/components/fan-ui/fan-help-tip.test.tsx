// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FanHelpTip } from "./fan-help-tip";

const pointer = (fine: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: fine && query.includes("pointer: fine"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
const tip = () => render(<FanHelpTip label="설명 보기" title="입국 심사" closeLabel="닫기" detailsLabel="자세히">팬 인증이 돼요</FanHelpTip>);

afterEach(() => vi.unstubAllGlobals());

describe("FanHelpTip", () => {
  it("shows a tooltip on hover and keyboard focus, and Escape closes it", () => {
    pointer(true); tip();
    const button = screen.getByRole("button", { name: "자세히 설명 보기" });
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip").textContent).toBe("팬 인증이 돼요");
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    // A click that does not move focus (assistive tech, scripted press) still shows the tooltip.
    expect(screen.getByRole("tooltip").textContent).toBe("팬 인증이 돼요");
  });

  it("opens a modal on tap, with the title and a close button", () => {
    pointer(false); tip();
    const button = screen.getByRole("button", { name: "자세히 설명 보기" });
    fireEvent.mouseEnter(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("dialog").textContent).toContain("팬 인증이 돼요");
    expect(screen.getByRole("heading", { name: "입국 심사" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
