import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/a", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useSearchParams: () => new URLSearchParams(nav.search) }));
import { FanNavigationProgress, NAVIGATION_PROGRESS_DELAY_MS } from "./fan-navigation-progress";

beforeEach(() => { vi.useFakeTimers(); nav.pathname = "/a"; window.history.replaceState(null, "", "/a"); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

const link = (href: string) => { const a = document.createElement("a"); a.href = href; a.textContent = href; document.body.append(a); return a; };
// The real order: Next hydrates the React root on `document` before this component mounts, so the router link's handler (which cancels the
// browser's move with preventDefault) runs first. The handler is added here, before render, and stays for the whole test.
let routerHandler: (e: Event) => void;
beforeEach(() => { routerHandler = (e: Event) => e.preventDefault(); document.addEventListener("click", routerHandler); });
afterEach(() => { document.removeEventListener("click", routerHandler); });
const click = (a: Element, init: MouseEventInit = {}) => { a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })); };
const bar = () => document.querySelector("[data-fan-navigation-progress]");

it("shows the bar only when a move takes longer than 300ms and hides it when the address changes", () => {
  const view = render(<FanNavigationProgress />);
  const a = link("/b");
  click(a);
  act(() => { vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS - 10); });
  expect(bar()).toBeNull();
  act(() => { vi.advanceTimersByTime(20); });
  expect(bar()).not.toBeNull();
  nav.pathname = "/b"; view.rerender(<FanNavigationProgress />);
  expect(bar()).toBeNull();
});

it("shows the bar for a link the router has already cancelled (defaultPrevented) and for a click on text inside it", () => {
  render(<FanNavigationProgress />);
  const a = link("/b"); const inner = document.createElement("span"); a.append(inner);
  click(inner);
  act(() => { vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS + 10); });
  expect(bar()).not.toBeNull();
});

it("draws nothing for a button inside the link or a click that a handler stopped", () => {
  render(<FanNavigationProgress />);
  const a = link("/b"); const like = document.createElement("button"); a.append(like);
  click(like);
  const c = link("/c"); c.addEventListener("click", (e) => e.stopPropagation());
  click(c);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(bar()).toBeNull();
});

it("draws nothing for a quick move, a hash-only link, a new tab or another site", () => {
  const view = render(<FanNavigationProgress />);
  click(link("/a#top"));
  click(link("/c"), { metaKey: true });
  click(link("https://example.com/x"));
  act(() => { vi.advanceTimersByTime(1000); });
  expect(bar()).toBeNull();
  click(link("/d"));
  act(() => { vi.advanceTimersByTime(100); });
  nav.pathname = "/d"; view.rerender(<FanNavigationProgress />);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(bar()).toBeNull();
});
