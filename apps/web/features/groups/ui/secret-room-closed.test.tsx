import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GroupRoomsPanel } from "./group-rooms-panel";

it("shows the locked notice without loading rooms even for a direct room link", () => {
 const fetcher = vi.spyOn(globalThis, "fetch");
 render(<GroupRoomsPanel pageId="page" locale="ko" initialRoomId="room" />);
 expect(screen.getByText("일정 등급 이상만 들어올 수 있는, 최애와 라이브 채팅을 하는 프라이빗 공간이에요.")).toBeInTheDocument();
 expect(screen.getByRole("button", { name: "곧 열려요" })).toBeDisabled();
 expect(fetcher).not.toHaveBeenCalled();
 fetcher.mockRestore();
});
