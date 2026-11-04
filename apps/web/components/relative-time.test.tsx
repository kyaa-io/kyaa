// @vitest-environment jsdom
import {renderToString} from "react-dom/server";
import {render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {RelativeTime} from "./relative-time";

describe("RelativeTime", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T03:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("renders the absolute time on the server and relative time after mount", () => {
    const value = "2026-11-04T01:00:00Z";
    expect(renderToString(<RelativeTime value={value} locale="en" />)).toContain("Nov 4, 2026");
    render(<RelativeTime value={value} locale="en" />);
    const node = screen.getByText("2 hours ago");
    expect(node.tagName).toBe("TIME");
    expect(node.getAttribute("datetime")).toBe(value);
    expect(node.getAttribute("title")).toContain("10:00");
  });
  it("keeps the absolute date at seven days or more", () => {
    render(<RelativeTime value="2026-10-28T03:00:00Z" locale="ko" />);
    expect(screen.getByText(/2026/).getAttribute("title")).toBeTruthy();
  });
});
