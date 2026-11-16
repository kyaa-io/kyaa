import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const presence = vi.hoisted(() => ({ value: { data: undefined as unknown, error: false, retry: () => undefined } }));
vi.mock("./use-group-presence", () => ({ useGroupPresence: () => presence.value }));

import { FanPageHeader } from "@/components/fan-ui/fan-page-header";
import { GroupPresence } from "./group-presence";

const data = (onlineCount: number, todayCount: number) => ({ onlineCount, todayCount, artists: [] });

describe("page head presence line (U1, N18)", () => {
  it("hides zero online and today counts and keeps the fan count", () => {
    presence.value = { data: data(0, 0), error: false, retry: () => undefined };
    const { container } = render(<GroupPresence pageId="p" locale="ko" memberCount={0} />);
    expect(container.textContent).toBe("팬 0");
    expect(container.querySelector("[data-presence]")).toBeNull();
  });
  it("shows the counts that are above zero on one line", () => {
    presence.value = { data: data(4, 0), error: false, retry: () => undefined };
    const { container } = render(<GroupPresence pageId="p" locale="ko" memberCount={1234} />);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(2);
    expect(container.querySelector('[role="img"][aria-label="1,234"]')).not.toBeNull();
    expect(container.querySelector('[data-presence="online"] [role="img"][aria-label="4"]')).not.toBeNull();
    expect(container.querySelector('[data-presence="today"]')).toBeNull();
  });
});

describe("page head (U1)", () => {
  it("draws no introduction line without source text, and puts the social icons on their own row below the introduction, not in the name block or the fan-count line (대표 11/15 23:37)", () => {
    const { container } = render(<FanPageHeader image={{ src: null, alt: "" }} name="Hiroro" kind="fan" locale="ko" links={[{ kind: "tiktok", href: "https://www.tiktok.com/@x" }]} />);
    expect(container.querySelector("p")).toBeNull();
    const link = screen.getByRole("link", { name: "tiktok" });
    expect(link.closest("[class*='headline']")).toBeNull();
    expect(link.closest("[class*='stats']")).toBeNull();
    expect(link.closest("[class*='links']")).not.toBeNull();
  });

  it("keeps 더 보기·번역 보기 at the end of the introduction's last line, one text line tall, so the fan line does not move (대표 11/15 17:42)", () => {
    render(<FanPageHeader image={{ src: null, alt: "" }} name="이퓨" kind="fan" locale="ko" description="소개" descriptionAction={<button type="button" data-translation-control="">번역 보기</button>} />);
    const button = screen.getByRole("button", { name: "번역 보기" });
    expect(button.parentElement?.parentElement?.querySelector(":scope > p")?.textContent).toBe("소개");
    const css = readFileSync("components/fan-ui/fan-page-header.module.css", "utf8");
    expect(css).toContain(".description { grid-column: 1 / -1; display: flex; align-items: flex-end;");
    expect(css).toContain("height: calc(var(--fan-description-size) * 1.5)");
  });
});
