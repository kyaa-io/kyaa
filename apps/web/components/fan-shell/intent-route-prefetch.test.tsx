import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const prefetch = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));

import { IntentRoutePrefetch } from "./intent-route-prefetch";

beforeEach(() => { vi.useFakeTimers(); prefetch.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function tabs() {
  return render(
    <nav>
      <a data-fan-navigation-id="community" href="/community?locale=ko">모임</a>
      <a data-fan-navigation-id="my" href="/my?locale=ko">MY</a>
      <a href="/community?locale=ko">본문 안 링크</a>
      <IntentRoutePrefetch hrefs={["/community?locale=ko", "/my?locale=ko"]} />
    </nav>,
  );
}

it("reads no tab while the page is only open", () => {
  tabs();
  vi.advanceTimersByTime(30_000);
  expect(prefetch).not.toHaveBeenCalled();
});

it("reads one tab in full when a pointer, touch or focus reaches it", () => {
  const view = tabs();
  fireEvent.pointerOver(view.getByText("모임"));
  expect(prefetch).toHaveBeenCalledWith("/community?locale=ko", { kind: "full" });
  fireEvent.touchStart(view.getByText("MY"));
  expect(prefetch).toHaveBeenCalledWith("/my?locale=ko", { kind: "full" });
  expect(prefetch).toHaveBeenCalledTimes(2);
});

it("ignores links that are not a registered tab and repeats a tab at most every 30 seconds", () => {
  const view = tabs();
  fireEvent.pointerOver(view.getByText("본문 안 링크"));
  expect(prefetch).not.toHaveBeenCalled();
  fireEvent.pointerOver(view.getByText("모임"));
  fireEvent.focusIn(view.getByText("모임"));
  expect(prefetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30_001);
  fireEvent.pointerOver(view.getByText("모임"));
  expect(prefetch).toHaveBeenCalledTimes(2);
});
