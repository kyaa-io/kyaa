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
  it("disables a gold room that needs the jjinfan title and offers one link to certifications", () => {
    const select = vi.fn();
    const room = { id: "c", name: "골드 방", minimumTier: "Gold", status: "open", canEnter: false, reason: "jjinfan_required" as const, latestMessage: "비밀 메시지", unreadCount: 5 };
    render(<GroupRoomList rooms={[room]} locale="ko" statusLabels={{ open: "입장 조건" }} unreadLabel="읽지 않음" proofHref="/c/x/certifications?locale=ko" onSelect={select}/>);
    const button = screen.getByRole("button", { name: /골드 방/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toContain("Gold · ");
    expect(screen.queryByText("비밀 메시지")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/c/x/certifications?locale=ko");
  });
});
