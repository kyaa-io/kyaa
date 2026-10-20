import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true, fail: false, hasComment: false }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: state.authenticated, getAccessToken: async () => "token" }) }));
vi.mock("./use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { comments: state.hasComment ? [{ id: "home-cheer-comment", body: "응원해요", nickname: "팬", avatarUrl: "/avatar.png", createdAt: "2026-10-21T00:00:00Z", isOwner: true }] : [], total: state.hasComment ? 1 : 0, nextCursor: null } }, retry: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: () => null }));
import { NoticeComments } from "./notice-comments";
const returnTo = "/kyaa-wave-fanpage/programs/live-insight?locale=ko";
beforeEach(() => { state.authenticated = true; state.fail = false; state.hasComment = false; vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: state.fail ? 500 : 200 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("program comment context", () => {
  it.each([returnTo, "/kyaa-wave-fanpage?locale=ko#wave-home-cheer"])("retains comment return path in login: %s", returnTo => { state.authenticated = false; render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="live-insight" locale="ko" returnTo={returnTo} />); expect(screen.getByRole("link")).toHaveAttribute("href", `/login?locale=ko&returnTo=${encodeURIComponent(returnTo)}`); });
  it("notifies only after successfully posting", async () => {
    const onPosted = vi.fn(), onChanged = vi.fn(); render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="live-insight" locale="ko" returnTo={returnTo} onPosted={onPosted} onChanged={onChanged} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "기억에 남는 순간" } });
    state.fail = true; fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("alert"); expect(onPosted).not.toHaveBeenCalled(); expect(onChanged).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(onPosted).toHaveBeenCalledOnce()); expect(screen.getByRole("textbox")).toHaveValue(""); expect(onChanged).toHaveBeenCalledOnce();
  });
  it("notifies home mission refresh only after a successful deletion", async () => {
    state.hasComment = true;
    const onPosted = vi.fn(), onChanged = vi.fn();
    render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="wave-home-cheer" locale="ko" onPosted={onPosted} onChanged={onChanged} />);
    state.fail = true; fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await screen.findByRole("alert"); expect(onChanged).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(onPosted).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith("/api/notice-comments/home-cheer-comment", expect.objectContaining({ method: "DELETE" }));
  });
});
