// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { anchorHydrated, trackOutboundLinks } from "./outbound-link-tracker";
import { recordProductEventV1 } from "./product-event-client";

vi.mock("./product-event-client", () => ({ recordProductEventV1: vi.fn().mockResolvedValue(true) }));
const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); document.body.innerHTML = ""; vi.useRealTimers(); vi.clearAllMocks(); });

/** Server HTML React has not hydrated yet: an owned outer element above unowned children (what a pending Suspense boundary looks like). */
function serverFooterUnderReact() {
  const { container } = render(<div data-testid="shell" />);
  const shell = container.firstElementChild as HTMLElement;
  shell.innerHTML = '<footer><nav><a href="https://kyaawave.com/">kyaa wave</a></nav></footer>';
  return shell.querySelector("a")!;
}
const hydrate = (node: Element) => Object.assign(node, { ["__reactFiber$test"]: {} });

it("tells hydrated anchors from server HTML React still has to hydrate", () => {
  document.body.innerHTML = '<a href="https://plain.example/">plain</a>';
  expect(anchorHydrated(document.querySelector("a")!)).toBe(true); // no React here
  const { container } = render(<p><a href="https://react.example/">react</a><span dangerouslySetInnerHTML={{ __html: '<b><a href="https://rich.example/">rich</a></b>' }} /></p>);
  const [owned, rich] = [...container.querySelectorAll("a")];
  expect(anchorHydrated(owned)).toBe(true);
  expect(anchorHydrated(rich)).toBe(true); // rich text children are never React's
  expect(anchorHydrated(serverFooterUnderReact())).toBe(false);
});

it("F5: leaves a not-yet-hydrated footer link as the server drew it, decorates it once hydrated, and still measures a click before that", async () => {
  vi.useFakeTimers();
  const anchor = serverFooterUnderReact();
  stops.push(trackOutboundLinks(document, "/"));
  expect(anchor.getAttribute("href")).toBe("https://kyaawave.com/");
  anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  expect(recordProductEventV1).toHaveBeenCalledTimes(1);
  expect(anchor.getAttribute("href")).toBe("https://kyaawave.com/");
  // React hydrates the boundary: every element on the way up becomes owned.
  for (let node: Element | null = anchor; node && node.tagName !== "DIV"; node = node.parentElement) hydrate(node);
  await act(async () => { vi.advanceTimersByTime(300); });
  expect(anchor.getAttribute("href")).toContain("utm_source=kyaa");
  expect(anchor.getAttribute("href")).toContain("utm_medium=referral");
});

it("keeps 'off' links and existing queries and hashes as they were on hydrated anchors", () => {
  render(<div><a href="https://shop.example/item?ref=1#size">shop</a><span data-outbound-tracking="off"><a href="https://pay.example/session">pay</a></span></div>);
  stops.push(trackOutboundLinks(document, "/"));
  const [shop, pay] = [...document.querySelectorAll("a")];
  expect(shop.getAttribute("href")).toMatch(/^https:\/\/shop\.example\/item\?ref=1&utm_source=kyaa.*#size$/);
  expect(pay.getAttribute("href")).toBe("https://pay.example/session");
});
