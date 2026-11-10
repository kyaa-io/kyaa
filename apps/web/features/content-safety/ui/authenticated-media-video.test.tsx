import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthenticatedMedia } from "./authenticated-media";
import { purgeVideoBlobs } from "./video-blob-cache";

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
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:poster"), revokeObjectURL: vi.fn() }));
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

const originals = () => variants().filter(variant => variant === "original").length;
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const shared = (key = "k", id = "shared") => <AuthenticatedMedia key={key} asset={{ id, width: 720, height: 1280, kind: "video" }} locale="ko" alt="영상" play />;

it("viewers mounted at the same time, and a viewer re-keyed in the same render pass, share one whole-file download", async () => {
  const a = render(shared("a")), b = render(shared("b"));
  intersect();
  await waitFor(() => expect(document.querySelectorAll("video")).toHaveLength(2));
  expect(originals()).toBe(1);
  b.unmount(); a.rerender(shared("a2"));
  intersect();
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  expect(originals()).toBe(1);
});

const grace = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 1700)); });

it("a completed blob with no viewer is revoked by the session purge at once, and by the grace timeout otherwise; coming back downloads again", async () => {
  const first = render(shared("k", "revoked"));
  intersect();
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  const revoke = vi.mocked(URL.revokeObjectURL); revoke.mockClear();
  first.unmount();
  purgeVideoBlobs();                       // sign-out / owner / generation change while no viewer is mounted
  expect(revoke).toHaveBeenCalledWith("blob:poster");
  render(shared("k", "revoked"));
  intersect();
  await waitFor(() => expect(originals()).toBe(2));
  cleanup();
  revoke.mockClear();
  render(shared("k", "grace")); intersect();
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  cleanup(); revoke.mockClear();
  await grace();                           // no purge: the short grace ends the entry
  expect(revoke).toHaveBeenCalledWith("blob:poster");
});

it("a pending download with no viewer is aborted by the purge, and a late answer is revoked without reaching another viewer or scope", async () => {
  let release!: (response: Response) => void; const signals: AbortSignal[] = [];
  fetcher.mockImplementation((url: string, init?: RequestInit) => {
    if (new URL(String(url), "http://x").searchParams.get("variant") === "original") { signals.push(init!.signal!); return new Promise<Response>(resolve => { release = resolve; }); }
    return Promise.resolve(new Response(new Blob(["x"], { type: "image/webp" })));
  });
  const view = render(shared("k", "pending"));
  intersect();
  await waitFor(() => expect(signals).toHaveLength(1));
  const revoke = vi.mocked(URL.revokeObjectURL); revoke.mockClear();
  view.unmount();
  purgeVideoBlobs();
  expect(signals[0]!.aborted).toBe(true);
  release(new Response(new Blob(["late"], { type: "video/mp4" })));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(document.querySelector("video")).toBeNull();
});

it("the session provider purges the blob cache on every owner, generation and sign-in change", async () => {
  const { readFileSync } = await import("node:fs");
  const provider = readFileSync("components/byus-session-provider.tsx", "utf8");
  expect(provider).toContain('import { purgeVideoBlobs } from "@/features/content-safety/ui/video-blob-cache"');
  expect(provider).toMatch(/useEffect\(\(\) => \{ purgeVideoBlobs\(\); \}, \[authenticated, snapshot\.ownerId, snapshot\.generation\]\)/);
});
