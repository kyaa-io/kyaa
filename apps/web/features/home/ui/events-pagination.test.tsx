import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { EventsPagination } from "./events-pagination";

vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a> }));

describe("events pagination", () => {
  it("hides navigation when all events fit on one page", () => {
    render(<EventsPagination locale="ko" page={1} pageCount={1} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps the locale and page destination on both links", () => {
    render(<EventsPagination locale="ko" page={2} pageCount={3} />);
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute("href", "/events?locale=ko");
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute("href", "/events?locale=ko&page=3");
    expect(screen.getByText("2 / 3")).toHaveAttribute("aria-current", "page");
  });

  it.each(APP_LOCALES)("provides accessible translated navigation and disables the first boundary in %s", (locale) => {
    render(<EventsPagination locale={locale} page={1} pageCount={2} />);
    expect(screen.getByRole("navigation")).toHaveAccessibleName();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/events?locale=${locale}&page=2`);
    expect(document.querySelector('[aria-disabled="true"]')).toBeInTheDocument();
  });

  it("disables the last boundary", () => {
    render(<EventsPagination locale="en" page={3} pageCount={3} />);
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/events?locale=en&page=2");
  });
});
