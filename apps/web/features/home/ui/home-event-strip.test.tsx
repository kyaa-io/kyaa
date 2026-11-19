import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { HomeEventStrip } from "./home-event-strip";
import { EventDayEyebrow } from "./event-day-eyebrow";

vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a> }));

const banner = { id: "77777777-7777-4777-8777-777777777777", title: "유나 × Kyaa", href: "/yuna" };
const at = new Date("2026-11-19T13:24:00+09:00");

describe("HomeEventStrip", () => {
  it("is one link over the whole line: banner title, one-day label and the time left until midnight", () => {
    render(<HomeEventStrip banner={banner} locale="ko" now={at} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/yuna?locale=ko");
    expect(link).toHaveTextContent("유나 × Kyaa");
    expect(link).toHaveTextContent("오늘 하루 이벤트");
    expect(link).toHaveTextContent("10시간 36분 남음");
  });

  it("closes with a 44px button and remembers the banner id in a cookie", () => {
    const { container } = render(<HomeEventStrip banner={banner} locale="ko" now={at} />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(container).toBeEmptyDOMElement();
    expect(document.cookie).toContain(`kyaa_event_strip_closed=${banner.id}`);
    document.cookie = "kyaa_event_strip_closed=; max-age=0; path=/";
  });

  it("uses the reader's language", () => {
    render(<HomeEventStrip banner={{ ...banner, title: "Yuna × Kyaa" }} locale="en" now={at} />);
    expect(screen.getByRole("link")).toHaveTextContent("10h 36m left");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("EventDayEyebrow", () => {
  it("shows the tag with the time left; under an hour it counts minutes only", () => {
    const { container } = render(<EventDayEyebrow locale="ko" now={new Date("2026-11-19T23:24:00+09:00")} />);
    expect(container).toHaveTextContent("오늘 하루 이벤트");
    expect(container).toHaveTextContent("36분 남음");
  });
});
