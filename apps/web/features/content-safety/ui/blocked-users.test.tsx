import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({ request: vi.fn(async () => ({})), retry: vi.fn() }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ authenticated: true, request: state.request }),
  useGroupResource: () => ({ data: { profiles: [{ profileId: id, closed: false, nickname: "예시 팬", avatarUrl: null, blockedAt: "2026-11-01T00:00:00Z" }] }, retry: state.retry }),
}));
import { BlockedUsers } from "./blocked-users";
afterEach(() => { cleanup(); state.request.mockReset(); state.request.mockResolvedValue({}); state.retry.mockClear(); });

it("removes a successfully unblocked account from the list immediately", async () => {
  render(<BlockedUsers locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "차단 해제: 예시 팬" }));
  await waitFor(() => expect(screen.getByText("차단한 사용자가 없어요.")).toBeInTheDocument());
  expect(state.request).toHaveBeenCalledWith(`/api/me/social/blocks/${id}`, { method: "DELETE" });
  expect(state.retry).toHaveBeenCalledOnce();
});

it("keeps the account visible when unblocking fails", async () => {
  state.request.mockRejectedValueOnce(new Error("offline"));
  render(<BlockedUsers locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "차단 해제: 예시 팬" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "차단 해제: 예시 팬" })).toBeEnabled();
  expect(state.retry).not.toHaveBeenCalled();
});
