import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_LOCALES } from "@/i18n/locales";
import { FocusFlowFrame } from "./focus-flow-frame";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("FocusFlowFrame language switch (N19)", () => {
  beforeEach(() => {
    push.mockReset();
    window.history.replaceState({}, "", "/c/kara/verify/questions?attempt=a1&returnTo=%2Flive%2Fx&locale=ko");
  });

  it("puts the shared header language switch next to the flow actions and keeps the current route", () => {
    render(
      <FocusFlowFrame locale="ko" languageSwitch headerActions={<span>1 / 4</span>}>
        <main />
      </FocusFlowFrame>,
    );
    const banner = screen.getByRole("banner");
    const trigger = banner.querySelector("[data-language-switch]");
    expect(trigger).not.toBeNull();
    expect(within(banner).getByText("1 / 4")).toBeInTheDocument();

    fireEvent.click(trigger as HTMLElement);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button", { pressed: false }).length + 1).toBe(APP_LOCALES.length);
    fireEvent.click(within(dialog).getByRole("button", { name: /日本語/ }));
    expect(push).toHaveBeenCalledWith("/c/kara/verify/questions?attempt=a1&returnTo=%2Flive%2Fx%3Flocale%3Dja&locale=ja");
  });

  it("stays opt-in so flows that already own a switch do not get a second one", () => {
    render(<FocusFlowFrame locale="ko"><main /></FocusFlowFrame>);
    expect(document.querySelector("[data-language-switch]")).toBeNull();
  });
});
