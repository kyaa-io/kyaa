import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { FeedVideo } from "./feed-video";
import { feedVideoCopy } from "./feed-video-copy";

type Observer = { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> };
let observers: Observer[] = [];
let reduced = false;
let saveData = false;
let playImpl: () => Promise<void>;

beforeEach(() => {
  observers = []; reduced = false; saveData = false; playImpl = () => Promise.resolve();
  vi.stubGlobal("IntersectionObserver", class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData }) });
  HTMLMediaElement.prototype.play = vi.fn(() => playImpl());
  HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ratio = (index: number, value: number) => act(() => { observers[index]!.callback([{ intersectionRatio: value } as IntersectionObserverEntry], {} as IntersectionObserver); });
const css = readFileSync(join(__dirname, "feed-video.module.css"), "utf8");
const props = { src: "blob:a", width: 9, height: 16, label: "영상", locale: "ko" as const };

it("caps the size by CSS contract: 70vh up to 640px on desktop and 520px on mobile, ratio kept, no raw colour or 767px query", () => {
  expect(css).toContain("--feed-video-cap: min(70vh, 640px)");
  expect(css).toMatch(/@media \(width < 48rem\) \{ \.frame \{ --feed-video-cap: min\(70vh, 520px\)/);
  expect(css).not.toContain("767px");
  expect(css).toContain("max-height: var(--feed-video-cap)");
  expect(css).toContain("aspect-ratio: var(--feed-video-ratio");
  expect(css).not.toMatch(/background:\s*(#000|black)/i);
  expect(css).not.toMatch(/rgb\(|#[0-9a-f]{3,6}\b/i);
});

it("renders muted, inline, looping, metadata-only video in its own ratio", () => {
  const { container } = render(<FeedVideo {...props} width={720} height={1280} />);
  const video = container.querySelector("video")!;
  expect(video.muted).toBe(true);
  expect(video).toHaveAttribute("playsinline");
  expect(video).toHaveAttribute("preload", "metadata");
  expect(video.loop).toBe(true);
  expect(container.querySelector("[data-feed-video]")).toHaveStyle({ aspectRatio: "720 / 1280" });
});

it("plays at 60% visibility, pauses offscreen, and only the most visible plays", () => {
  render(<><FeedVideo {...props} label="a" /><FeedVideo {...props} label="b" /></>);
  const [a, b] = Array.from(document.querySelectorAll("video"));
  const play = vi.spyOn(a!, "play"), pauseA = vi.spyOn(a!, "pause"), playB = vi.spyOn(b!, "play"), pauseB = vi.spyOn(b!, "pause");
  ratio(0, 0.5); expect(play).not.toHaveBeenCalled();
  ratio(0, 0.7); expect(play).toHaveBeenCalled();
  ratio(1, 0.9); expect(playB).toHaveBeenCalled(); expect(pauseA).toHaveBeenCalled();
  ratio(1, 0); expect(pauseB).toHaveBeenCalled();
});

it("toggles sound with a labelled button", () => {
  const { container } = render(<FeedVideo {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "소리 켜기" }));
  expect(container.querySelector("video")!.muted).toBe(false);
  expect(screen.getByRole("button", { name: "소리 끄기" })).toBeInTheDocument();
});

it("lets the viewer pause and resume the autoplaying loop; a manual pause is not undone by scrolling back", () => {
  const { container } = render(<FeedVideo {...props} />);
  const video = container.querySelector("video")!;
  ratio(0, 0.9);
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  fireEvent.play(video);
  const pauseButton = screen.getByRole("button", { name: "일시정지" });
  vi.mocked(video.play).mockClear();
  fireEvent.click(pauseButton);
  expect(video.pause).toHaveBeenCalled();
  fireEvent.pause(video);
  ratio(0, 0); ratio(0, 0.9);
  expect(video.play).not.toHaveBeenCalled();
  Object.defineProperty(video, "paused", { configurable: true, value: true });
  fireEvent.click(screen.getByRole("button", { name: "재생" }));
  expect(video.play).toHaveBeenCalled();
});

it("when the browser refuses autoplay it falls back to a manual player: a play button, then native controls", async () => {
  playImpl = () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
  const { container } = render(<FeedVideo {...props} />);
  const video = container.querySelector("video")!;
  ratio(0, 0.9);
  await act(async () => { await Promise.resolve(); });
  expect(video.loop).toBe(false);
  expect(screen.queryByRole("button", { name: "소리 켜기" })).toBeNull();
  playImpl = () => Promise.resolve();
  fireEvent.click(screen.getByRole("button", { name: "재생" }));
  expect(container.querySelector("video")).toHaveAttribute("controls");
  expect(video.muted).toBe(false);
});

it("an interrupted play (AbortError) is not a refusal and keeps the autoplay controls", async () => {
  playImpl = () => Promise.reject(Object.assign(new Error("interrupted"), { name: "AbortError" }));
  render(<FeedVideo {...props} />);
  ratio(0, 0.9);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("button", { name: "소리 켜기" })).toBeInTheDocument();
});

it("pauses when the tab is hidden and resumes the visible one when it comes back", () => {
  const { container } = render(<FeedVideo {...props} />);
  const video = container.querySelector("video")!;
  ratio(0, 0.9);
  vi.mocked(video.pause).mockClear(); vi.mocked(video.play).mockClear();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(video.pause).toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(video.play).toHaveBeenCalled();
});

it("does not autoplay under reduced motion or Save-Data; shows a play button instead", () => {
  for (const mode of ["reduced", "saveData"] as const) {
    reduced = mode === "reduced"; saveData = mode === "saveData";
    const { container, unmount } = render(<FeedVideo {...props} />);
    expect(observers).toHaveLength(0);
    expect(container.querySelector("video")!.loop).toBe(false);
    expect(screen.queryByRole("button", { name: "소리 켜기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    expect(container.querySelector("video")).toHaveAttribute("controls");
    unmount();
  }
});

it("starts with controls and sound when the viewer already pressed play on the poster", () => {
  const { container } = render(<FeedVideo {...props} startManual />);
  const video = container.querySelector("video")!;
  expect(video).toHaveAttribute("controls");
  expect(video.muted).toBe(false);
  expect(video.play).toHaveBeenCalled();
});

it("names every button in all twelve languages", () => {
  for (const locale of APP_LOCALES) {
    const copy = feedVideoCopy(locale);
    const { unmount } = render(<FeedVideo {...props} locale={locale} />);
    expect(screen.getByRole("button", { name: copy.soundOn })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.play })).toBeInTheDocument();
    unmount();
    expect(new Set(Object.values(copy)).size).toBe(4);
  }
});
