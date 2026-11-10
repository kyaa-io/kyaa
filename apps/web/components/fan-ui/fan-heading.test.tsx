import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FanHeading, FanSectionHeader } from "./fan-heading";

describe("shared fan headings", () => {
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
  it("does not create empty description or action placeholders", () => {
    const { container } = render(<FanSectionHeader title="혜택" />);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("puts rail controls in the title row after the action, outside the content", () => {
    const { container } = render(<FanSectionHeader title="당신의 최애" action={{ href: "/celebrities", label: "최애 전체 보기" }} controlsLabel="최애 목록 이동" controls={<><button type="button">이전 최애</button><button type="button">다음 최애</button></>} />);
    const group = screen.getByRole("group", { name: "최애 목록 이동" });
    expect(group.parentElement).toBe(screen.getByRole("link", { name: "최애 전체 보기" }).parentElement);
    expect(group.previousElementSibling).toBe(screen.getByRole("link", { name: "최애 전체 보기" }));
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });
});
