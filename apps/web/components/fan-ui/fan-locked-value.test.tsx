import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locales";
import { FanLockedRows, FanLockedValue } from "./fan-locked-value";

describe("FanLockedValue", () => {
  it("names the locked value and shows no placeholder text", () => {
    render(<FanLockedValue locale="ko" />);
    const value = screen.getByRole("img", { name: "로그인 후 확인" });
    expect(value).toHaveTextContent("");
    expect(value.querySelector("svg")).toHaveAttribute("width", "24");
    expect(value.closest("a, button")).toBeNull();
  });

  it("is a 16 icon beside a title (대표 11/28 195099)", () => {
    render(<FanLockedValue locale="en" size="title" />);
    expect(screen.getByRole("img", { name: "Sign in to view" }).querySelector("svg")).toHaveAttribute("width", "16");
  });

  it("has a distinct accessible name in every locale", () => {
    const names = APP_LOCALES.map((locale) => {
      const { unmount } = render(<FanLockedValue locale={locale} />);
      const name = screen.getByRole("img").getAttribute("aria-label");
      unmount();
      return name;
    });
    expect(names.every((name) => name?.trim())).toBe(true);
    expect(new Set(names).size).toBe(APP_LOCALES.filter(locale => locale !== "mn").length);
  });
});

describe("FanLockedRows", () => {
  it("draws the requested rows, hidden from assistive technology and not as loading", () => {
    const { container } = render(<FanLockedRows rows={3} />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).not.toHaveAttribute("aria-busy");
    expect(root.children).toHaveLength(3);
    expect(root).toHaveTextContent("");
  });
});
