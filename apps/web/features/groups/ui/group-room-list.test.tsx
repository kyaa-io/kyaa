import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupPublicRoomList, GroupRoomHub, GroupRoomHubSkeleton, pickFeaturedRoom } from "./group-room-list";
const statusLabels = { open: "대화 가능", readonly: "읽기 전용", closed: "종료", scheduled: "예약" };
type TestRoom = React.ComponentProps<typeof GroupRoomHub>["rooms"][number];
const rooms: TestRoom[] = [
  { id: "a", name: "공개 방", minimumTier: null, status: "open", canEnter: true, latestMessage: "실제 메시지", unreadCount: 2 },
  { id: "b", name: "잠긴 방", minimumTier: "Gold", status: "open", canEnter: false, latestMessage: "비밀 메시지", unreadCount: 9 },
];
const people = [{ profileId: "30000000-0000-4000-8000-000000000001", nickname: "첫 팬", avatarUrl: null, tier: null }, { profileId: "30000000-0000-4000-8000-000000000002", nickname: "둘째 팬", avatarUrl: null, tier: "Gold" }];
const hub = (items = rooms, extra: Partial<React.ComponentProps<typeof GroupRoomHub>> = {}) => <GroupRoomHub rooms={items} locale="ko" statusLabels={statusLabels} unreadLabel="읽지 않음" onSelect={vi.fn()} {...extra} />;
describe("GroupRoomHub", () => {
  it("puts the enterable open room in the big card and the locked room in the list with its tier", () => {
    const select = vi.fn();
    render(hub(rooms, { onSelect: select, people }));
    const card = screen.getByLabelText("공개 방");
    expect(within(card).getByText("대화 가능")).toBeInTheDocument();
    expect(within(card).getByText("실제 메시지")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: /들어가기/ }));
    expect(select).toHaveBeenCalledWith(rooms[0]);
    expect(screen.getByRole("heading", { name: "다른 방" })).toBeInTheDocument();
    const locked = screen.getByRole("button", { name: /잠긴 방/ });
    expect(within(locked).getByText("골드 이상")).toBeInTheDocument();
    expect(within(locked).getByText("조건 보기")).toBeInTheDocument();
    expect(screen.queryByText("비밀 메시지")).not.toBeInTheDocument();
    expect(screen.queryByText("9")).not.toBeInTheDocument();
    fireEvent.click(locked);
    expect(select).toHaveBeenCalledWith(rooms[1]);
    expect(screen.getByText("첫 팬")).toBeInTheDocument();
  });
  it("draws no avatar strip without people and no search under eight rooms", () => {
    render(hub());
    expect(screen.queryByText("참여 팬")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
  it("searches the other rooms only when there are eight or more rooms", () => {
    const many: TestRoom[] = Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, name: `방 ${i}`, minimumTier: "Gold", status: "open", canEnter: false }));
    render(hub(many));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "방 3" } });
    expect(screen.getAllByRole("button", { name: /방 /})).toHaveLength(1);
  });
  it("has no big card when every room is locked and keeps the list as is", () => {
    render(hub([rooms[1]]));
    expect(screen.queryByRole("heading", { name: "다른 방" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /잠긴 방/ })).toBeInTheDocument();
    expect(pickFeaturedRoom([rooms[1]])).toBeUndefined();
  });
  it("disables a gold room that needs the jjinfan title and offers one link to certifications", () => {
    const select = vi.fn();
    const room = { id: "c", name: "골드 방", minimumTier: "Gold", status: "open", canEnter: false, reason: "jjinfan_required" as const, latestMessage: "비밀 메시지", unreadCount: 5 };
    render(hub([room], { proofHref: "/c/x/certifications?locale=ko", onSelect: select }));
    const button = screen.getByRole("button", { name: /골드 방/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toContain("골드 · ");
    expect(screen.queryByText("비밀 메시지")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/x/certifications?locale=ko");
  });
  it("labels a room without a tier as joined fans, or verified fans for a certified room", () => {
    render(hub([{ ...rooms[1], id: "d", name: "자유방", minimumTier: null, defaultKey: "free" as const }, { ...rooms[1], id: "e", name: "인증방", minimumTier: null, defaultKey: "certified" as const }], { verifiable: true }));
    expect(within(screen.getByRole("button", { name: /자유방/ })).getByText("가입한 팬")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /인증방/ })).getByText("팬 인증 완료")).toBeInTheDocument();
  });
});
describe("GroupPublicRoomList", () => {
  it("shows names and tiers as links and never any room content", () => {
    render(<GroupPublicRoomList rooms={[{ name: "인증팬 소통방", minimumTier: "Bronze" }, { name: "자유 소통방", minimumTier: null }]} locale="ko" rowHref="/login?x=1" />);
    const link = screen.getByRole("link", { name: /인증팬 소통방/ });
    expect(within(link).getByText("브론즈 이상")).toBeVisible();
    expect(within(screen.getByRole("link", { name: /자유 소통방/ })).getByText("가입한 팬")).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
  it("runs the join action for a signed-in non-member instead of linking", () => {
    const join = vi.fn();
    render(<GroupPublicRoomList rooms={[{ name: "자유 소통방", minimumTier: null }]} locale="ko" onRowClick={join} />);
    fireEvent.click(screen.getByRole("button", { name: /자유 소통방/ }));
    expect(join).toHaveBeenCalledOnce();
  });
});
describe("GroupRoomEmpty", () => {
  it("keeps the room card frame when a page has no public rooms", () => {
    const { container } = render(<GroupPublicRoomList rooms={[]} locale="ko" />);
    expect(screen.getByText("아직 열린 방이 없어요")).toBeInTheDocument();
    expect(container.querySelector("[data-room-empty] li")).not.toBeNull();
  });
});
describe("GroupRoomHubSkeleton", () => {
  it("is one status without any visible loading text", () => {
    const { container } = render(<GroupRoomHubSkeleton label="불러오는 중" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.textContent).toBe("");
  });
});
