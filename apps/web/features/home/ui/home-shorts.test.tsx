import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeShorts } from "./home-shorts";
import type { HomeShort } from "../domain/home-gallery";

vi.mock("./shorts-engagement", () => ({ ShortsEngagement: ({ videoId }: { videoId: string }) => <div data-testid="engagement">{videoId}</div> }));
const items = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, videoId: `video${i}`, title: `영상 ${i}`, href: `https://youtube.com/watch?v=video${i}`, creator: { slug: "a", name: "A" } })) as HomeShort[];

describe("shorts viewer", () => {
  it("shows every loaded card in the scroll row and navigates all videos and unmounts the previous player", () => {
    render(<HomeShorts items={items} locale="ko" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "영상 5" }));
    const dialog = screen.getByRole("dialog");
    const previous = within(dialog).getByTitle("영상 5");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(previous.isConnected).toBe(false);
    expect(within(dialog).getByTitle("영상 6")).toHaveAttribute("src", "https://www.youtube.com/embed/video6?rel=0");
    expect(within(dialog).getByTestId("engagement")).toHaveTextContent("video6");
    const zone = dialog.querySelector('[aria-hidden="true"]')?.parentElement;
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 영상" }));
    expect(within(dialog).getByTitle("영상 7")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "다음 영상" })).toBeDisabled();
    expect(zone).toBeTruthy();
  });
  it("prefers a stored thumbnail to a platform cover", () => {
    const thumbnail = "/api/public/notice-media/20000000-0000-4000-8000-000000000002?variant=thumbnail";
    const item = { id: "t1", platform: "tiktok", videoId: "7690854938997558549", title: "원문 제목", href: "https://www.tiktok.com/@ifewknow/video/7690854938997558549", creator: { slug: "a", name: "A" }, thumbnail } as HomeShort;
    const { container } = render(<HomeShorts items={[item]} locale="ko" />);
    expect(decodeURIComponent(container.querySelector("img")!.getAttribute("src")!)).toContain(thumbnail);
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
  });
  it("plays a TikTok short in the TikTok player with its kept cover", () => {
    const tiktok = { id: "t1", platform: "tiktok", videoId: "7690854938997558549", title: "안녕히 계세여~", href: "https://www.tiktok.com/@ifewknow/video/7690854938997558549", creator: { slug: "a", name: "A" } } as HomeShort;
    const { container } = render(<HomeShorts items={[tiktok]} locale="ko" />);
    expect(decodeURIComponent(container.querySelector("img")!.getAttribute("src")!)).toContain("/images/media/tiktok/7690854938997558549.jpg");
    fireEvent.click(screen.getByRole("button", { name: "안녕히 계세여~" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTitle("안녕히 계세여~").getAttribute("src")).toBe("https://www.tiktok.com/embed/7690854938997558549");
    fireEvent.click(within(dialog).getByRole("button", { name: "더 보기" }));
    expect(within(dialog).getByRole("link", { name: "TikTok ↗" })).toHaveAttribute("href", tiktok.href);
  });
  it("opens a shared video and changes it by a touch gesture outside the iframe", () => {
    render(<HomeShorts items={items} locale="ko" layout="grid" initialVideo="video1" />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTitle("영상 1")).toBeInTheDocument();
    const swipe = dialog.querySelector('[class*="swipeZone"]')!;
    fireEvent.touchStart(swipe, { touches: [{ clientY: 250 }] });
    fireEvent.touchEnd(swipe, { changedTouches: [{ clientY: 100 }] });
    expect(within(dialog).getByTitle("영상 2")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /YouTube/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "더 보기" }));
    expect(within(dialog).getByRole("link", { name: /YouTube/ })).toHaveAttribute("href", items[2]!.href);
  });
  it("shows the creator's profile photo in the caption and keeps the title to one line", () => {
    const item = { ...items[0]!, creator: { slug: "a", name: "A", avatar: { src: "/images/celebrities/a/profile.jpg" } } } as HomeShort;
    const { container } = render(<HomeShorts items={[item, items[1]!]} locale="ko" />);
    const avatars = container.querySelectorAll("[data-creator-avatar]");
    expect(decodeURIComponent(avatars[0]!.querySelector("img")!.getAttribute("src")!)).toContain("/images/celebrities/a/profile.jpg");
    expect(avatars[1]!.querySelector("img")).toBeNull();
    expect(avatars[1]!.querySelector("svg")).not.toBeNull();
  });
});

describe("shorts scroll loading", () => {
  const page = (from: number, count: number, hasMore: boolean) => ({ items: Array.from({ length: count }, (_, i) => { const code = String(from + i).padStart(11, "x"); return { id: `00000000-0000-4000-8000-${String(from + i).padStart(12, "0")}`, platform: "youtube", videoId: code, title: `영상 ${from + i}`, href: `https://www.youtube.com/watch?v=${code}`, creator: { slug: "a", name: "A" } }; }), hasMore });
  afterEach(() => vi.unstubAllGlobals());
  it("asks for the next page once the end is visible and stops after the last page", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => page(8, 4, false) });
    vi.stubGlobal("fetch", fetcher);
    render(<HomeShorts items={items} locale="ko" layout="grid" offset={12} hasMore />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(12));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/public/home-shorts?locale=ko&offset=20");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });
  it("does not ask for more without a next page", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<HomeShorts items={items} locale="ko" layout="grid" hasMore={false} />);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows one retry button after a failure and loads again when pressed", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) }).mockResolvedValue({ ok: true, json: async () => page(8, 2, false) });
    vi.stubGlobal("fetch", fetcher);
    render(<HomeShorts items={items} locale="ko" layout="grid" hasMore />);
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(10));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });
});
