import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeedVideo } from "./feed-video";

type Observer = { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> };
let observers: Observer[] = [];
let reduced = false;

beforeEach(() => {
  observers = [];
  reduced = false;
  vi.stubGlobal("IntersectionObserver", class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ratio = (index: number, value: number) => observers[index]!.callback([{ intersectionRatio: value } as IntersectionObserverEntry], {} as IntersectionObserver);
const css = readFileSync(join(__dirname, "feed-video.module.css"), "utf8");

it("caps the size by CSS contract: 70vh up to 640px on desktop and 520px on mobile, ratio kept", () => {
  expect(css).toContain("--feed-video-cap: min(70vh, 640px)");
  expect(css).toMatch(/max-width: 767px\) \{ \.frame \{ --feed-video-cap: min\(70vh, 520px\)/);
  expect(css).toContain("max-height: var(--feed-video-cap)");
  expect(css).toContain("aspect-ratio: var(--feed-video-ratio");
  expect(css).not.toMatch(/background:\s*(#000|black)/i);
});

it("renders muted, inline, looping, metadata-only video in its own ratio", () => {
  const { container } = render(<FeedVideo src="blob:a" width={720} height={1280} label="영상" />);
  const video = container.querySelector("video")!;
  expect(video.muted).toBe(true);
  expect(video).toHaveAttribute("playsinline");
  expect(video).toHaveAttribute("preload", "metadata");
  expect(video.loop).toBe(true);
  expect(container.querySelector("[data-feed-video]")).toHaveStyle({ aspectRatio: "720 / 1280" });
  expect(screen.getByRole("button", { name: "소리 켜기" }).offsetParent).not.toBeUndefined();
});

it("plays at 60% visibility, pauses offscreen, and only the most visible plays", () => {
  render(<><FeedVideo src="blob:a" width={9} height={16} label="a" /><FeedVideo src="blob:b" width={9} height={16} label="b" /></>);
  const [a, b] = Array.from(document.querySelectorAll("video"));
  const play = vi.spyOn(a!, "play"), pauseA = vi.spyOn(a!, "pause"), playB = vi.spyOn(b!, "play"), pauseB = vi.spyOn(b!, "pause");
  ratio(0, 0.5); expect(play).not.toHaveBeenCalled();
  ratio(0, 0.7); expect(play).toHaveBeenCalled();
  ratio(1, 0.9); expect(playB).toHaveBeenCalled(); expect(pauseA).toHaveBeenCalled();
  ratio(1, 0); expect(pauseB).toHaveBeenCalled();
});

it("toggles sound with a labelled button", () => {
  const { container } = render(<FeedVideo src="blob:a" width={9} height={16} label="a" />);
  fireEvent.click(screen.getByRole("button", { name: "소리 켜기" }));
  expect(container.querySelector("video")!.muted).toBe(false);
  expect(screen.getByRole("button", { name: "소리 끄기" })).toBeInTheDocument();
});

it("does not autoplay under reduced motion; shows a play button instead", () => {
  reduced = true;
  const { container } = render(<FeedVideo src="blob:a" width={9} height={16} label="a" />);
  expect(observers).toHaveLength(0);
  expect(container.querySelector("video")!.loop).toBe(false);
  expect(screen.queryByRole("button", { name: "소리 켜기" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "재생" }));
  expect(container.querySelector("video")).toHaveAttribute("controls");
});
