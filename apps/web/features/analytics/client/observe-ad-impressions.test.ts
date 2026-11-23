import { afterEach, expect, it, vi } from "vitest";
import { observeAdImpressions } from "./observe-ad-impressions";
import { recordProductEventV1 } from "./product-event-client";

vi.mock("./product-event-client", () => ({ recordProductEventV1: vi.fn().mockResolvedValue(true) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
  document.body.replaceChildren();
});

it("requires a continuous second at half visibility and records once after a remount", async () => {
  vi.useFakeTimers();
  let notify!: (entries: Partial<IntersectionObserverEntry>[]) => void;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {} disconnect() {} unobserve() {}
  });
  const id = "a002b205-c7ff-4bc9-b067-fb8d69e81be2";
  const node = document.createElement("div");
  const link = document.createElement("a");
  link.href = "https://beepio.cc/";
  node.append(link);
  node.dataset.adBanner = id;
  document.body.append(node);
  const start = () => { const observer = observeAdImpressions(document); observer.scan(); return observer; };
  const visibility = (ratio: number) => notify([{ target: node, isIntersecting: true, intersectionRatio: ratio }]);
  const first = start();
  visibility(0.5);
  await vi.advanceTimersByTimeAsync(999);
  visibility(0.49);
  await vi.advanceTimersByTimeAsync(1500);
  expect(recordProductEventV1).not.toHaveBeenCalled();
  visibility(0.5);
  await vi.advanceTimersByTimeAsync(1000);
  expect(recordProductEventV1).toHaveBeenCalledWith(expect.objectContaining({ properties: { adId: id, advertiser: "beepio" } }));
  first.stop();
  const second = start();
  visibility(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(recordProductEventV1).toHaveBeenCalledTimes(1);
  second.stop();
});
