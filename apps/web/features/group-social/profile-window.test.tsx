import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => ({ request, ready: true, ownerKey: "guest:1" }) }));
import { ProfileAuthor, closeProfileWindow, useProfileWindowTarget } from "./profile-window";
afterEach(() => { cleanup(); closeProfileWindow(); request.mockReset(); });
const open = "40000000-0000-4000-8000-000000000001", closed = "40000000-0000-4000-8000-000000000002";
const Target = () => <output data-testid="target">{JSON.stringify(useProfileWindowTarget()?.ref ?? null)}</output>;

it("asks once for every name on screen; an open author is a button, the rest stay text (anonymous, gone, proof, blocked)", async () => {
  request.mockResolvedValue({ open: [{ kind: "fan_post", id: open }] });
  render(<><ProfileAuthor contentRef={{ kind: "fan_post", id: open }} nickname="열림" avatarUrl={null}>열림</ProfileAuthor><ProfileAuthor contentRef={{ kind: "fan_post", id: closed }} nickname="닫힘" avatarUrl={null}>닫힘</ProfileAuthor><Target/></>);
  expect(screen.queryByRole("button")).toBeNull();
  await screen.findByRole("button", { name: "열림" });
  expect(screen.queryByRole("button", { name: "닫힘" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(JSON.parse(atob(String(request.mock.calls[0]![0]).split("refs=")[1]!.replaceAll("-", "+").replaceAll("_", "/")))).toHaveLength(2);
  expect(request.mock.calls[0]![1]).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "열림" }));
  await waitFor(() => expect(screen.getByTestId("target").textContent).toBe(JSON.stringify({ kind: "fan_post", id: open })));
});
it("leaves every name as text when the question fails", async () => {
  request.mockRejectedValue(new Error("down"));
  render(<ProfileAuthor contentRef={{ kind: "group_post", id: open }} nickname="이름" avatarUrl={null}>이름</ProfileAuthor>);
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(screen.queryByRole("button")).toBeNull();
});
