import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ShortsEngagement } from "./shorts-engagement";
const mocks = vi.hoisted(() => ({ request: vi.fn(), retry: vi.fn(), authenticated: true }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: mocks.authenticated }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ request: mocks.request, busy: false, error: "" }) }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: (url: string | null) => ({ retry: mocks.retry, state: !url ? { status: "loading" } : url.includes("/comments") ? { status: "ready", data: { items: [{ id: "c1", body: "댓글", createdAt: "2026-11-10T00:00:00Z", isOwner: true, author: { nickname: "팬" } }], nextCursor: null } } : { status: "ready", data: { reaction: "like", likeCount: 1, dislikeCount: 0, commentCount: 1 } } }) }));
beforeEach(() => { mocks.authenticated = true; mocks.request.mockReset().mockResolvedValue({ ok: true }); mocks.retry.mockReset(); });
it("sends reactions and comments to the selected video", async () => {
  render(<ShortsEngagement videoId="abc" locale="ko" offset={0} />);
  fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/shorts/abc/reactions", "PUT", { reaction: "none" }));
  fireEvent.click(screen.getByRole("button", { name: "댓글" }));
  fireEvent.change(screen.getByRole("textbox", { name: "댓글 쓰기" }), { target: { value: "안녕하세요" } });
  fireEvent.click(screen.getByRole("button", { name: "등록" }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/shorts/abc/comments", "POST", expect.objectContaining({ body: "안녕하세요", idempotencyKey: expect.any(String) })));
});
it("sends signed-out reactions and comment writers to sign in", () => {
  mocks.authenticated = false;
  render(<ShortsEngagement videoId="abc" locale="ko" offset={12} />);
  expect(screen.getByRole("link", { name: /좋아요/ }).getAttribute("href")).toContain("login");
  fireEvent.click(screen.getByRole("button", { name: "댓글" }));
  expect(screen.getByRole("link", { name: /로그인/ }).getAttribute("href")).toContain("login");
});
