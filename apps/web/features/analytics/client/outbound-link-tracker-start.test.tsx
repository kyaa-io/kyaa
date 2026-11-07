// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./product-event-client", () => ({ recordProductEventV1: vi.fn().mockResolvedValue(true) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/pages/groups" }));
afterEach(() => { document.body.innerHTML = ""; vi.resetModules(); });

const link = () => {
  const a = document.createElement("a"); a.href = "https://kyaawave.com/"; document.body.append(a);
  return a;
};

it("leaves hrefs alone while the page may still be hydrating, then decorates once it is idle", async () => {
  const { OutboundLinkTracker } = await import("./outbound-link-tracker");
  const a = link();
  render(<OutboundLinkTracker />);
  expect(a.getAttribute("href")).toBe("https://kyaawave.com/");
  await waitFor(() => expect(a.getAttribute("href")).toContain("utm_source=kyaa"));
});

it("starts at the first pointer input, before the click it has to record", async () => {
  const { OutboundLinkTracker } = await import("./outbound-link-tracker");
  const a = link();
  render(<OutboundLinkTracker />);
  act(() => { a.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  expect(a.getAttribute("href")).toContain("utm_source=kyaa");
});
