import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FanHeading, FanSectionHeader } from "./fan-heading";

describe("shared fan headings", () => {
  it("keeps campaign names semantic h2 headings", () => {
    render(<FanHeading variant="campaign">유나</FanHeading>);
    expect(screen.getByRole("heading", { level: 2, name: "유나" })).toHaveAttribute("data-fan-heading", "campaign");
  });
  it("keeps semantic level and ID independent of visual role", () => {
    render(<FanHeading as="h1" id="my-title" variant="personal-page">MY</FanHeading>);
    expect(screen.getByRole("heading", { level: 1, name: "MY" })).toHaveAttribute("id", "my-title");
    expect(screen.getByRole("heading")).toHaveAttribute("data-fan-heading", "personal-page");
  });
  it.each(["standard", "editorial", "personal"] as const)("renders the %s title, description and accessible action", (variant) => {
    render(<FanSectionHeader variant={variant} id="upcoming" title="다가오는 LIVE" description="미리 예약하세요" action={{ href: "/live", label: "전체 보기" }} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "upcoming");
    expect(screen.getByText("미리 예약하세요")).toBeVisible();
    expect(screen.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/live");
  });
  it("renders an optional second action in the same row", () => {
    render(<FanSectionHeader title="최애" action={{ href: "/a", label: "전체" }} extraAction={{ href: "/rankings", label: "랭킹" }} />);
    expect(screen.getByRole("link", { name: "전체" }).getAttribute("href")).toBe("/a");
    expect(screen.getByRole("link", { name: "랭킹" }).getAttribute("href")).toBe("/rankings");
  });
  it("renders an in-place action as a small text button on the title row, not a link", () => {
    const onClick = vi.fn();
    const { container } = render(<FanSectionHeader title="스탬프 모으기" action={{ label: "기록 보기 · 3", onClick, expanded: false, controls: "history" }} />);
    const button = screen.getByRole("button", { name: /기록 보기 · 3/ });
    expect(screen.queryByRole("link")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "history");
    expect(container.querySelector("[data-fan-section-header] > div")).toContainElement(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("does not create empty description or action placeholders", () => {
    const { container } = render(<FanSectionHeader title="혜택" />);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
