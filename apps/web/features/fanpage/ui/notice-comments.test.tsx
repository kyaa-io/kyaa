import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true, fail: false }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: state.authenticated, getAccessToken: async () => "token" }) }));
vi.mock("./use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { comments: [], total: 0, nextCursor: null } }, retry: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: () => null }));
import { NoticeComments } from "./notice-comments";
const returnTo = "/kyaa-wave-fanpage/programs/live-insight?locale=ko";
beforeEach(() => { state.authenticated = true; state.fail = false; vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: state.fail ? 500 : 200 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("program comment context", () => {
  it("retains program return path in login", () => { state.authenticated = false; render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="live-insight" locale="ko" returnTo={returnTo} />); expect(screen.getByRole("link")).toHaveAttribute("href", `/login?locale=ko&returnTo=${encodeURIComponent(returnTo)}`); });
  it("notifies only after successfully posting", async () => {
    const onPosted = vi.fn(); render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="live-insight" locale="ko" returnTo={returnTo} onPosted={onPosted} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "기억에 남는 순간" } });
    state.fail = true; fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("alert"); expect(onPosted).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(onPosted).toHaveBeenCalledOnce()); expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
