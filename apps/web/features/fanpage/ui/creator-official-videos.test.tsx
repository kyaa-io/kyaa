import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorOfficialVideos } from "./creator-official-videos";

afterEach(() => vi.unstubAllGlobals());
const answer = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => body }));

describe("verified official channels", () => {
  it("embeds the video the server picked, never a playlist", async () => {
    answer({ videoId: "good0000001" });
    render(<CreatorOfficialVideos slug="nchive" locale="ja" />);
    const source = new URL((await screen.findByTitle("NCHIVE · 公式動画")).getAttribute("src")!);
    expect(source.origin).toBe("https://www.youtube.com");
    expect(source.pathname).toBe("/embed/good0000001");
    expect(source.searchParams.has("list")).toBe(false);
    expect(source.searchParams.get("autoplay")).toBe("0");
    expect(source.searchParams.get("hl")).toBe("ja");
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute("href", "https://www.youtube.com/channel/UCO-svEJBdWiaViuy0TxVFFg");
    expect(fetch).toHaveBeenCalledWith("/api/celebrities/nchive/youtube/embed", expect.anything());
  });
  it("keeps only the YouTube link when no video is playable or the request fails", async () => {
    for (const reply of [() => answer({ videoId: null }), () => answer({}, false), () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline"))), () => answer({ videoId: "../x" })]) {
      reply();
      const { container, unmount } = render(<CreatorOfficialVideos slug="nchive" locale="ko" />);
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      await Promise.resolve();
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.getByRole("link", { name: "YouTube" })).toBeInTheDocument();
      unmount();
    }
  });
  it("shows the pinned We;Na video without asking the server", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<CreatorOfficialVideos slug="wena" locale="ja" />);
    expect(new URL(screen.getByTitle("We;Na · 公式動画").getAttribute("src")!).pathname).toBe("/embed/172bEkNPqqs");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each(["unknown", "constructor"])("does not guess a channel for %s", slug => {
    const { container } = render(<CreatorOfficialVideos slug={slug} locale="ko" />);
    expect(container).toBeEmptyDOMElement();
  });
});
