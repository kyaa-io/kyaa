import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyLogout } from "./my-logout";

const { logout, replace } = vi.hoisted(() => ({ logout: vi.fn(), replace: vi.fn() }));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: "owner-a" }, getAccessToken: vi.fn(), logout }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  logout.mockReset().mockResolvedValue(undefined);
  replace.mockReset();
});

describe("MY logout", () => {
  it("asks once before logging out, with focus on cancel", async () => {
    render(<MyLogout locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    const dialog = await screen.findByRole("dialog", { name: "로그아웃" });
    await waitFor(() => expect(screen.getByRole("button", { name: "취소" })).toHaveFocus());
    expect(logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });

  it("logs out and replaces the page with login after confirming", async () => {
    render(<MyLogout locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = await screen.findByRole("dialog", { name: "Log out" });
    fireEvent.click(dialog.querySelectorAll("button")[1]!);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?locale=en"));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open with the failure message when logout fails", async () => {
    logout.mockRejectedValueOnce(new Error("network"));
    render(<MyLogout locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    const dialog = await screen.findByRole("dialog", { name: "로그아웃" });
    fireEvent.click(dialog.querySelectorAll("button")[1]!);

    expect(await screen.findByRole("alert")).toHaveTextContent("로그아웃하지 못했어요. 다시 시도해 주세요.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("uses the existing settings translations", async () => {
    render(<MyLogout locale="ja" />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(await screen.findByRole("dialog", { name: "ログアウト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
  });
});
