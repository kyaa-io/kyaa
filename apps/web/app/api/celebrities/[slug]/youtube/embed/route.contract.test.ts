import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/server/youtube/youtube-uploads", () => ({ readOfficialEmbedVideoId: state.read }));
import { GET } from "./route";
const call = (slug: string) => GET(new Request(`https://byus.kr/api/celebrities/${slug}/youtube/embed`), { params: Promise.resolve({ slug }) });
beforeEach(() => state.read.mockReset());
it("serves the picked video for a verified channel and never a playlist", async () => {
  state.read.mockResolvedValue("good0000001");
  const response = await call("nchive");
  expect(await response.json()).toEqual({ videoId: "good0000001" });
  expect(state.read).toHaveBeenCalledWith("https://www.youtube.com/channel/UCO-svEJBdWiaViuy0TxVFFg");
});
it("answers videoId null when nothing playable was found, so the page keeps only the YouTube link", async () => {
  state.read.mockResolvedValue(null);
  expect(await (await call("nchive")).json()).toEqual({ videoId: null });
});
it("uses the pinned video without calling the API, and 404s for other creators", async () => {
  expect(await (await call("wena")).json()).toEqual({ videoId: "172bEkNPqqs" });
  expect(state.read).not.toHaveBeenCalled();
  expect((await call("elina")).status).toBe(404);
  expect((await call("constructor")).status).toBe(404);
});
