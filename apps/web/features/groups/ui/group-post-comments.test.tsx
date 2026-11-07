// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
const retry = vi.fn();
const parent = { id: "11111111-1111-4111-8111-111111111111", body: "첫 댓글", profileId: null, nickname: "하늘", avatarUrl: null, anonymous: false, createdAt: "2026-11-07T00:00:00Z", canDelete: false, parentId: null, assets: [] };
const mine = { ...parent, id: "22222222-2222-4222-8222-222222222222", body: "내 댓글", nickname: "나", canDelete: true };

vi.mock("./use-group-resource", () => ({ useGroupResource: () => ({ data: { items: [parent, mine], nextCursor: null }, error: false, loading: false, authenticated: true, ownerKey: "me", retry, request }) }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], busy: false, ready: true, invalid: false, add: vi.fn(), retry: vi.fn(), remove: vi.fn(), markUsed: vi.fn() }) }));
vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnBadgeCorner: ({ children }: { children: React.ReactNode }) => children }));
const toast = vi.fn();
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: (options: unknown) => toast(options) }));

import { GroupPostComments } from "./group-post-comments";

const page = "33333333-3333-4333-8333-333333333333", post = "44444444-4444-4444-8444-444444444444";
const view = () => render(<GroupPostComments pageId={page} postId={post} locale="ko" canWrite />);

describe("GroupPostComments", () => {
  beforeEach(() => { request.mockReset(); retry.mockReset(); toast.mockReset(); });
  afterEach(cleanup);

  it("writes a reply in its own box under the comment and saves it with the parent id", async () => {
    request.mockResolvedValue({ id: "x" });
    view();
    const main = screen.getByRole("textbox", { name: "댓글" });
    fireEvent.click(screen.getAllByRole("button", { name: "답글" })[0]);
    const reply = screen.getByLabelText("하늘님에게 답글");
    fireEvent.change(reply, { target: { value: "답글 내용" } });
    expect((main as HTMLTextAreaElement).value).toBe("");
    fireEvent.submit(reply.closest("form")!);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(`/api/groups/${page}/posts/${post}/comments`);
    expect(JSON.parse(init.body)).toMatchObject({ body: "답글 내용", parentId: parent.id });
    await waitFor(() => expect(screen.queryByLabelText("하늘님에게 답글")).toBeNull());
  });

  it("cancelling a reply never turns it into a top-level comment", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: "답글" })[0]);
    fireEvent.change(screen.getByLabelText("하늘님에게 답글"), { target: { value: "보내지 않음" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByLabelText("하늘님에게 답글")).toBeNull();
    expect((screen.getByRole("textbox", { name: "댓글" }) as HTMLTextAreaElement).value).toBe("");
    expect(request).not.toHaveBeenCalled();
  });

  it("a failed save keeps the text and shows an error toast with retry", async () => {
    request.mockRejectedValue(new Error("down"));
    view();
    const main = screen.getByRole("textbox", { name: "댓글" });
    fireEvent.change(main, { target: { value: "남는 글" } });
    fireEvent.submit(main.closest("form")!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "댓글을 저장하지 못했어요", tone: "error", action: expect.objectContaining({ label: "다시 시도" }) })));
    expect((main as HTMLTextAreaElement).value).toBe("남는 글");
  });

  it("every comment has a ⋯ menu: report for others, delete with a confirm dialog for own", async () => {
    request.mockResolvedValue({});
    view();
    const menus = screen.getAllByRole("button", { name: "댓글 메뉴" });
    expect(menus).toHaveLength(2);
    fireEvent.click(menus[0]);
    const first = await screen.findByRole("menu");
    expect(within(first).getByRole("menuitem", { name: "신고" })).toBeTruthy();
    expect(within(first).queryByRole("menuitem", { name: "삭제" })).toBeNull();
    fireEvent.keyDown(first, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.click(menus[1]);
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "삭제" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("댓글을 삭제할까요?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/groups/${page}/posts/${post}/comments/${mine.id}`, { method: "DELETE" }));
  });
});
