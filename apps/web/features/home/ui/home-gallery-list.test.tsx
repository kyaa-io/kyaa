import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import page from "@/server/home-gallery/fixtures/read_public_home_gallery_photos_page.json";
import type { HomeGalleryPhoto } from "@/features/home/domain/home-gallery";
import { HomeGalleryList } from "./home-gallery-list";

// Real read_public_home_gallery_photos rows (two photos). The test IntersectionObserver reports the tail as visible at once.
const first = page.items as HomeGalleryPhoto[];
const copyOf = (id: string): HomeGalleryPhoto => ({ ...first[0]!, id });
const answer = (items: HomeGalleryPhoto[], nextCursor: string | null) => new Response(JSON.stringify({ items, nextCursor }), { status: 200 });
const photoCount = () => document.querySelectorAll('[data-gallery-layout="mobile"] li').length;
afterEach(() => vi.unstubAllGlobals());

describe("gallery automatic loading", () => {
  it("appends the next page once when the end is near, drops a photo already shown, and stops at the last page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer([first[1]!, copyOf("celebrity:new-1:portrait"), copyOf("celebrity:new-2:portrait")], "c2"))
      .mockResolvedValueOnce(answer([copyOf("celebrity:new-3:portrait")], null));
    vi.stubGlobal("fetch", fetchMock);
    render(<HomeGalleryList locale="ko" firstPage={first} firstCursor="c1" />);
    await waitFor(() => expect(photoCount()).toBe(5));
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/public/gallery?locale=ko&cursor=c1", "/api/public/gallery?locale=ko&cursor=c2"]);
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });
  it("shows the retry button after a failure, does not loop, and loads by hand", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(answer([copyOf("celebrity:new-1:portrait")], null));
    vi.stubGlobal("fetch", fetchMock);
    render(<HomeGalleryList locale="ko" firstPage={first} firstCursor="c1" />);
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(photoCount()).toBe(3));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps the button for keyboard users while more pages exist and keeps the first page's photos in place", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<HomeGalleryList locale="ko" firstPage={first} firstCursor="c1" />);
    expect(screen.getByRole("button", { name: "더 보기" })).toBeDisabled();
    expect(photoCount()).toBe(2);
  });
  it("makes no request when there is no next page", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<HomeGalleryList locale="ko" firstPage={first} firstCursor={null} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("official source mark", () => {
  it("names official photos kyaa official with a 16px corner mark and leaves fan photos unmarked", () => {
    const fan: HomeGalleryPhoto = { ...first[0]!, id: "fan-1", source: "fan_post" };
    render(<HomeGalleryList locale="ko" firstPage={[first[0]!, fan]} firstCursor={null} />);
    const mobile = document.querySelector('[data-gallery-layout="mobile"]')!;
    const marks = mobile.querySelectorAll("[data-official-badge]");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe("kyaa official");
    expect(marks[0]!.closest("li")!.textContent).toContain(first[0]!.creator!.name);
  });
});
