import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, ownerKey: "fan:1" },
  resource: { loading: false, data: undefined as unknown, error: false, failure: undefined as { status: number } | undefined, retry: () => {} },
  page: { page: { id: "page-1", name: "엘리나" }, celebrity: { name: "엘리나" }, presence: { data: undefined as unknown }, locale: "ko", activeTab: "home", hrefFor: (tab: string) => `/elina?locale=ko&tab=${tab}`, selectTab: vi.fn(), star: { state: "empty", label: "팬인증하기", href: "/verify" } },
  toast: vi.fn(),
  session: { ownerId: "fan-1" },
}));
vi.mock("./use-group-resource", () => ({ useGroupRequest: () => state.auth, useGroupResource: () => state.resource }));
vi.mock("./group-page-context", () => ({ useGroupPage: () => state.page, useOptionalGroupPage: () => state.page }));
vi.mock("./group-chat-room", () => ({ GroupChatRoom: ({ pageId, onOnlineCount }: { pageId: string; onOnlineCount: (count: number) => void }) => <button onClick={() => onOnlineCount(3)}>room:{pageId}</button> }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: state.toast, closeFanToast: vi.fn() }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => state.session }));
vi.mock("@/components/fan-ui/fan-star-action", () => ({ FanStarAction: ({ label, href }: { label: string; href: string }) => <a href={href}>{label}</a> }));

import { GroupChatPanel } from "./group-chat-panel";
import { CreatorEntryToast } from "./creator-entry-toast";
import { groupTabItems } from "./group-tab-links";
import { useOnlineCreators } from "@/features/rankings/ui/use-online-creators";

beforeEach(() => { state.auth = { ready: true, authenticated: true, ownerKey: "fan:1" }; state.resource = { loading: false, data: undefined, error: false, failure: undefined, retry: () => {} }; state.toast.mockReset(); window.localStorage.clear(); });

describe("채팅방 패널", () => {
  it("로그인하지 않으면 로그인 조건과 로그인 버튼만", () => {
    state.auth = { ready: true, authenticated: false, ownerKey: "guest:0" };
    render(<GroupChatPanel pageId="page-1" locale="ko" roomHref="/elina?locale=ko&tab=rooms" />);
    expect(screen.getByText("로그인하면 들어올 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", expect.stringContaining("returnTo="));
  });
  it("팬인증하지 않은 회원(403)은 팬인증 버튼", () => {
    state.resource = { ...state.resource, error: true, failure: { status: 403 } };
    render(<GroupChatPanel pageId="page-1" locale="ko" roomHref="/elina?locale=ko&tab=rooms" />);
    expect(screen.getByText("팬인증한 팬만 들어올 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "팬인증하기" })).toHaveAttribute("href", "/verify");
  });
  it("들어갈 수 있으면 대화를 열고, 접속 중인 사람 수를 머리에 적는다", () => {
    state.resource = { ...state.resource, data: { items: [], canSend: true, artist: false } };
    render(<GroupChatPanel pageId="page-1" locale="en" roomHref="/elina?locale=en&tab=rooms" />);
    expect(screen.getByRole("heading", { name: "Chat" })).toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "room:page-1" }).click());
    expect(screen.getByText(/Online/)).toHaveTextContent("Online 3");
  });
  it("팬페이지 탭 이름은 채팅방, 다른 모임은 그대로", () => {
    expect(groupTabItems("ko", false, true).find((item) => item.key === "rooms")?.label).toBe("채팅방");
    expect(groupTabItems("ko", true, false).find((item) => item.key === "rooms")?.label).toBe("비밀방");
  });
});

describe("크리에이터 입장 알림", () => {
  const artists = (online: boolean, id = "artist-1") => ({ data: { onlineCount: 1, todayCount: 1, artists: [{ profileId: id, nickname: "elina_official", online, visitedToday: true }] } });
  it("들어오면 한 번, 같은 접속 동안 다시 띄우지 않고, 나갔다 들어오면 다시", () => {
    state.page.presence = artists(true);
    const view = render(<CreatorEntryToast />);
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.toast.mock.calls[0]![0]).toMatchObject({ title: "엘리나 입장 중", action: { label: "채팅방 가기" } });
    state.page.presence = artists(true); view.rerender(<CreatorEntryToast />);
    expect(state.toast).toHaveBeenCalledTimes(1);
    state.page.presence = artists(false); view.rerender(<CreatorEntryToast />);
    state.page.presence = artists(true); view.rerender(<CreatorEntryToast />);
    expect(state.toast).toHaveBeenCalledTimes(2);
  });
  it("다른 탭·새로고침(30분 안)에는 다시 띄우지 않는다", () => {
    state.page.presence = artists(true);
    render(<CreatorEntryToast />).unmount();
    render(<CreatorEntryToast />);
    expect(state.toast).toHaveBeenCalledTimes(1);
  });
  it("크리에이터 자신에게는 띄우지 않는다", () => {
    state.page.presence = artists(true, "fan-1");
    render(<CreatorEntryToast />);
    expect(state.toast).not.toHaveBeenCalled();
  });
});

describe("랭킹 접속 표시 읽기", () => {
  const fetcher = vi.fn();
  beforeEach(() => { fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); });
  afterEach(() => vi.unstubAllGlobals());
  it("보이는 slug 를 한 번에 묻고 접속 중인 것만 돌려준다", async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ online: ["elina"] })));
    const { result } = renderHook(() => useOnlineCreators(["nchive", "elina"]));
    await waitFor(() => expect(result.current.has("elina")).toBe(true));
    expect(result.current.has("nchive")).toBe(false);
    expect(fetcher).toHaveBeenCalledWith("/api/groups/online-creators?slugs=elina%2Cnchive", expect.anything());
  });
  it("실패하면 표시만 빠진다", async () => {
    fetcher.mockResolvedValue(new Response("{}", { status: 503 }));
    const { result } = renderHook(() => useOnlineCreators(["elina"]));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.size).toBe(0);
  });
});
