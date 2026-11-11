import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeShorts } from "./home-shorts";
import type { HomeShort } from "../domain/home-gallery";

vi.mock("./shorts-engagement", () => ({ ShortsEngagement: ({ videoId }: { videoId: string }) => <div data-testid="engagement">{videoId}</div> }));
const items = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, videoId: `video${i}`, title: `영상 ${i}`, href: `https://youtube.com/watch?v=video${i}`, creator: { slug: "a", name: "A" } })) as HomeShort[];

describe("shorts viewer", () => {
  it("shows six home cards but navigates all videos and unmounts the previous player", () => {
    render(<HomeShorts items={items} locale="ko" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
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
});
