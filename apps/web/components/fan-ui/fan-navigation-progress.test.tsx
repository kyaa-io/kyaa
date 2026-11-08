import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/a", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useSearchParams: () => new URLSearchParams(nav.search) }));
import { FanNavigationProgress, NAVIGATION_PROGRESS_DELAY_MS } from "./fan-navigation-progress";

beforeEach(() => { vi.useFakeTimers(); nav.pathname = "/a"; window.history.replaceState(null, "", "/a"); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

const link = (href: string) => { const a = document.createElement("a"); a.href = href; a.textContent = href; document.body.append(a); return a; };
// jsdom would follow the link; a router link cancels it in its own handler after ours (document, bubble) has seen the click.
const click = (a: HTMLAnchorElement, init: MouseEventInit = {}) => { const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }); const stopNav = (e: Event) => e.preventDefault(); document.addEventListener("click", stopNav); a.dispatchEvent(event); document.removeEventListener("click", stopNav); };
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
