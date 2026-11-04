import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupRoomList } from "./group-room-list";
const rooms = [
  { id: "a", name: "공개 방", minimumTier: null, status: "open", canEnter: true, latestMessage: "실제 메시지", unreadCount: 2 },
  { id: "b", name: "잠긴 방", minimumTier: "Gold", status: "open", canEnter: false, latestMessage: "비밀 메시지", unreadCount: 9 },
];
describe("GroupRoomList", () => {
  it("filters by name and never exposes locked room previews or unread counts", () => {
    const select = vi.fn();
    render(<GroupRoomList rooms={rooms} locale="ko" statusLabels={{ open: "입장 조건" }} unreadLabel="읽지 않음" onSelect={select}/>);
    expect(screen.getByText("실제 메시지")).toBeInTheDocument();
    expect(screen.queryByText("비밀 메시지")).not.toBeInTheDocument();
    expect(screen.queryByText("9")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "잠긴" } });
    expect(screen.queryByText("공개 방")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /잠긴 방/ }));
    expect(select).toHaveBeenCalledWith(rooms[1]);
  });
});
