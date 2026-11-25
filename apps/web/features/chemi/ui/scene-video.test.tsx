import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SceneVideo } from "./scene-video";

let reduce = false;
beforeEach(() => {
  reduce = false;
  sessionStorage.clear();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") ? reduce : false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => this.dispatchEvent(new Event("playing")));
    return Promise.resolve();
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const video = (view: ReturnType<typeof render>) => view.container.querySelector("video")!;

it("plays a once video on the first visit and leaves the still art on a revisit", async () => {
  const first = render(<SceneVideo src="/v/intro" once />);
  await act(async () => {});
  expect(video(first).getAttribute("src")).toBe("/v/intro.mp4");
  expect(video(first)).toHaveAttribute("data-playing");
  first.unmount();
  const again = render(<SceneVideo src="/v/intro" once />);
  await act(async () => {});
  expect(video(again).hasAttribute("src")).toBe(false);
  expect(video(again)).not.toHaveAttribute("data-playing");
});

it("never loads or plays under reduced motion", async () => {
  reduce = true;
  const view = render(<SceneVideo src="/v/loop" />);
  await act(async () => {});
  expect(video(view).hasAttribute("src")).toBe(false);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("stops a loop while the banner is resting", async () => {
  const view = render(<SceneVideo src="/v/loop" paused />);
  await act(async () => {});
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(video(view)).not.toHaveAttribute("data-playing");
});
