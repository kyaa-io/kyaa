import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthenticatedMedia } from "./authenticated-media";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "u1" }, getAccessToken: async () => "token" }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "u1", generation: 0 }) }));

type Observer = { callback: IntersectionObserverCallback };
let observers: Observer[] = [];
let saveData = false;
let reduced = false;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  observers = []; saveData = false; reduced = false;
  vi.stubGlobal("IntersectionObserver", class { observe = vi.fn(); disconnect = vi.fn(); constructor(callback: IntersectionObserverCallback) { observers.push({ callback }); } });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData }) });
  fetcher = vi.fn(async () => new Response(new Blob(["x"], { type: "image/webp" })));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:poster", revokeObjectURL: () => {} }));
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const variants = () => fetcher.mock.calls.map(([url]) => new URL(String(url), "http://x").searchParams.get("variant"));
const intersect = () => act(() => { for (const { callback } of observers) callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver); });
let seq = 0;
const nextMedia = () => <AuthenticatedMedia asset={{ id: `v${++seq}`, width: 720, height: 1280, kind: "video" }} locale="ko" alt="영상" play />;

it("downloads only the poster until the video is near the screen, then the whole file", async () => {
  render(nextMedia());
  await waitFor(() => expect(variants()).toEqual(["thumbnail"]));
  expect(screen.getByRole("button", { name: "재생" })).toBeInTheDocument();
  intersect();
  await waitFor(() => expect(variants()).toContain("original"));
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
});

it("never downloads the whole file for Save-Data or reduced motion until the viewer presses play", async () => {
  for (const mode of ["saveData", "reduced"] as const) {
    saveData = mode === "saveData"; reduced = mode === "reduced"; fetcher.mockClear();
    const view = render(nextMedia());
    await waitFor(() => expect(variants()).toEqual(["thumbnail"]));
    intersect();
    await act(async () => { await Promise.resolve(); });
    expect(variants()).toEqual(["thumbnail"]);
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    await waitFor(() => expect(variants()).toContain("original"));
    await waitFor(() => expect(document.querySelector("video")).toHaveAttribute("controls"));
    view.unmount();
  }
});

it("a photo is not touched by the video gate", async () => {
  render(<AuthenticatedMedia asset={{ id: "p1", width: 100, height: 100 }} locale="ko" alt="사진" />);
  await waitFor(() => expect(variants()).toEqual(["thumbnail"]));
  expect(screen.queryByRole("button", { name: "재생" })).toBeNull();
});

it("mounts of the same video (page re-keys) share one whole-file download", async () => {
  const same = <AuthenticatedMedia asset={{ id: "shared", width: 720, height: 1280, kind: "video" }} locale="ko" alt="영상" play />;
  const first = render(same);
  intersect();
  await waitFor(() => expect(variants()).toContain("original"));
  first.unmount();
  render(same);
  intersect();
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  expect(variants().filter(variant => variant === "original")).toHaveLength(1);
});
