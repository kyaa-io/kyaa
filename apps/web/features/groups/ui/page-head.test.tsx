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
    expect(container.textContent).toBe("팬 1,234지금 접속 4");
    expect(container.querySelector('[data-presence="today"]')).toBeNull();
  });
});

describe("page head (U1)", () => {
  it("draws no introduction line without source text, and puts the social icons in the name block", () => {
    const { container } = render(<FanPageHeader image={{ src: null, alt: "" }} name="Hiroro" kind="fan" locale="ko" links={[{ kind: "tiktok", href: "https://www.tiktok.com/@x" }]} />);
    expect(container.querySelector("p")).toBeNull();
    const link = screen.getByRole("link", { name: "tiktok" });
    expect(link.closest("[class*='headline']")).not.toBeNull();
  });
});
