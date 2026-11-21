import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import real from "@/server/groups/__fixtures__/chat-real-sql.json";

const fan = "11130000-0000-4000-8000-000000000002";
const state = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), uploads: { items: [] as unknown[], invalid: false, ready: false, add: vi.fn(), remove: vi.fn(), retry: vi.fn(), markUsed: vi.fn() } }));
vi.mock("./use-group-resource", () => ({ GroupRequestError: class extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }, useGroupRequest: () => ({ request: state.request, ready: true, authenticated: true, ownerKey: "fan:1" }) }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => state.uploads }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: ({ asset, play }: { asset: { id: string; kind: string }; play: boolean }) => <span data-testid="media">{asset.kind}:{String(play)}</span> }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: state.toast }));
vi.mock("./group-image", () => ({ GroupImage: () => <span /> }));

import { GroupChatRoom } from "./group-chat-room";
import { GROUP_CHAT_READ_EVENT } from "./use-chat-unread";

const mine = (data: { items: { profileId: string }[] }, viewer: string) => ({ ...data, items: data.items.map((item) => ({ ...item, mine: item.profileId === viewer })) });
const posts = () => state.request.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init.body));

beforeEach(() => { state.request.mockReset(); state.toast.mockReset(); state.uploads = { ...state.uploads, items: [], invalid: false, ready: false }; });

describe("팬페이지 채팅방 대화", () => {
  it("읽은 위치 뒤 첫 메시지 앞에 경계선을 두고, 맨 아래를 보고 있으면 마지막 메시지까지 읽음으로 올린다", async () => {
    state.request.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? { read: true } : mine(real.readFan, fan));
    const read = vi.fn(), online = vi.fn();
    window.addEventListener(GROUP_CHAT_READ_EVENT, read);
    render(<GroupChatRoom pageId="page-1" locale="ko" onOnlineCount={online} />);
    const line = await screen.findByText("여기까지 읽었습니다");
    // 경계선은 크리에이터의 사진 메시지 바로 앞이다.
    expect(line.closest("[data-unread-line]")!.nextElementSibling).toHaveAttribute("data-artist", "true");
    expect(screen.getByText("크리에이터")).toBeInTheDocument();
    expect(screen.getByTestId("media")).toHaveTextContent("image:false");
    expect(screen.getAllByRole("img", { name: "접속 중" })).toHaveLength(1);
    expect(screen.getByText("읽음 1")).toBeInTheDocument();
    expect(online).toHaveBeenLastCalledWith(2);
    await waitFor(() => expect(posts()).toEqual([{ action: "read", through: real.readFan.items.at(-1)!.id }]));
    await waitFor(() => expect(read).toHaveBeenCalled());
    window.removeEventListener(GROUP_CHAT_READ_EVENT, read);
  });
  it("영상은 재생 단추가 있는 미리보기로, 읽은 사람이 없는 내 메시지에는 읽음을 적지 않는다", async () => {
    state.request.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? { read: true } : mine(real.readAfterRemove, fan));
    render(<GroupChatRoom pageId="page-1" locale="ko" />);
    expect(await screen.findByTestId("media")).toHaveTextContent("video:true");
    expect(screen.queryByText(/^읽음/)).not.toBeInTheDocument();
    expect(screen.queryByText("여기까지 읽었습니다")).not.toBeInTheDocument();
  });
  it("남의 메시지는 신고, 내 메시지는 삭제", async () => {
    state.request.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? { ok: true } : mine(real.readFan, fan));
    render(<GroupChatRoom pageId="page-1" locale="ko" />);
    await screen.findByText("리허설 사진이에요");
    const menus = screen.getAllByRole("button", { name: "메시지 메뉴" });
    fireEvent.click(menus[1]!);
    fireEvent.click(await screen.findByRole("menuitem", { name: "신고" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "신고 사유" }), { target: { value: "광고예요" } });
    fireEvent.click(screen.getByRole("dialog").querySelector("button[data-variant=primary]") ?? screen.getAllByRole("button", { name: "신고" }).at(-1)!);
    await waitFor(() => expect(posts()).toContainEqual({ action: "report", messageId: real.readFan.items[1]!.id, reason: "광고예요" }));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: "신고를 접수했어요", tone: "success" }));
    fireEvent.click(menus[0]!);
    fireEvent.click(await screen.findByRole("menuitem", { name: "삭제" }));
    fireEvent.click((await screen.findByRole("alertdialog")).querySelector("button[data-variant=danger]") ?? screen.getAllByRole("button", { name: "삭제" }).at(-1)!);
    await waitFor(() => expect(posts()).toContainEqual({ action: "remove", messageId: real.readFan.items[0]!.id }));
    await waitFor(() => expect(screen.queryByText("먼저 왔어요")).not.toBeInTheDocument());
  });
  it("올라간 사진·영상만으로도 보낸다", async () => {
    state.uploads = { ...state.uploads, items: [{ key: "u1", file: new File(["x"], "a.jpg", { type: "image/jpeg" }), media: { assetId: "a5500000-0000-4000-8000-000000000001", state: "ready" } }], ready: true };
    state.request.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? { id: "x" } : mine(real.emptyFan, fan));
    render(<GroupChatRoom pageId="page-1" locale="ko" />);
    const send = await screen.findByRole("button", { name: "보내기" });
    expect(screen.getByText("전송 전 첨부")).toBeInTheDocument();
    await act(async () => { fireEvent.click(send); });
    expect(posts()).toContainEqual({ body: "", assetId: "a5500000-0000-4000-8000-000000000001", requestId: expect.any(String) });
    expect(state.uploads.markUsed).toHaveBeenCalledWith("u1");
  });
  it("읽지 못하면 오류와 다시 시도만 보이고, 다시 시도하면 대화를 다시 읽는다", async () => {
    state.request.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(mine(real.emptyFan, fan));
    render(<GroupChatRoom pageId="page-1" locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("요청을 완료하지 못했어요");
    expect(screen.queryByText("읽기 전용")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "메시지" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("아직 대화가 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "메시지" })).toBeInTheDocument();
  });
  it("형식·크기가 맞지 않는 파일은 제한을 알린다", async () => {
    state.uploads = { ...state.uploads, invalid: true };
    state.request.mockResolvedValue(mine(real.emptyFan, fan));
    render(<GroupChatRoom pageId="page-1" locale="ko" />);
    expect(await screen.findByText("사진은 8MB, 영상은 50MB·60초까지 보낼 수 있습니다.")).toHaveAttribute("aria-live", "assertive");
  });
});
