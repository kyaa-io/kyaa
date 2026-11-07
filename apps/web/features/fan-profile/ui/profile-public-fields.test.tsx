import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfilePublicFields } from "./profile-public-fields";

const mock = vi.hoisted(() => ({ data: undefined as unknown, error: false, loading: false, request: vi.fn(), retry: vi.fn() }));
vi.mock("@/features/groups/ui/use-group-resource", () => {
  class GroupRequestError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
  return { GroupRequestError, useGroupResource: (url: string, parse: (value: unknown) => unknown) => ({ ...mock, url, ownerKey: "k", data: mock.data === undefined ? undefined : parse(mock.data) }) };
});
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));

const empty = { favorite: null, links: [], bio: null, favoriteOptions: [{ slug: "elina", name: "엘리나" }, { slug: "kara", name: "카라" }] };
beforeEach(() => { vi.clearAllMocks(); mock.data = empty; mock.error = false; });
afterEach(cleanup);

it("starts empty and saves only what the fan wrote", async () => {
  mock.request.mockResolvedValue({ ...empty, favorite: { slug: "elina", name: "엘리나" }, links: ["https://x.com/fan"], bio: "한 줄" });
  render(<ProfilePublicFields locale="ko"/>);
  const save = screen.getByRole("button", { name: "저장" });
  expect(save).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "최애" })).toHaveValue("");
  fireEvent.change(screen.getByRole("combobox", { name: "최애" }), { target: { value: "elina" } });
  fireEvent.change(screen.getByRole("textbox", { name: "소개 한 줄" }), { target: { value: " 한 줄 " } });
  fireEvent.change(screen.getByRole("textbox", { name: "SNS 링크 1" }), { target: { value: "https://x.com/fan" } });
  fireEvent.click(save);
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith("/api/me/social/profile-fields?locale=ko", { method: "PUT", body: JSON.stringify({ favoriteSlug: "elina", bio: "한 줄", links: ["https://x.com/fan"] }) }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "프로필을 저장했어요", tone: "success" }));
});

it("refuses a link that is not https and a 41-character intro before saving", () => {
  render(<ProfilePublicFields locale="ko"/>);
  fireEvent.change(screen.getByRole("textbox", { name: "SNS 링크 1" }), { target: { value: "http://x.com/fan" } });
  expect(screen.getByRole("alert")).toHaveTextContent("https://로 시작하는 주소만 넣을 수 있어요");
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "SNS 링크 1" }), { target: { value: "" } });
  fireEvent.change(screen.getByRole("textbox", { name: "소개 한 줄" }), { target: { value: "가".repeat(41) } });
  expect(screen.getByText("41/40")).toBeVisible();
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});

it("adds up to three link fields and removes them", () => {
  render(<ProfilePublicFields locale="ko"/>);
  fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
  fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
  expect(screen.getAllByRole("textbox", { name: /SNS 링크/ })).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "링크 추가" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "링크 삭제" })[0]);
  expect(screen.getAllByRole("textbox", { name: /SNS 링크/ })).toHaveLength(2);
});

it("shows the saved values and says when saving failed", async () => {
  mock.data = { ...empty, favorite: { slug: "kara", name: "카라" }, links: ["https://www.instagram.com/fan"], bio: "카라 팬" };
  mock.request.mockRejectedValue(new Error("x"));
  render(<ProfilePublicFields locale="ko"/>);
  expect(screen.getByRole("combobox", { name: "최애" })).toHaveValue("kara");
  expect(screen.getByRole("textbox", { name: "SNS 링크 1" })).toHaveValue("https://www.instagram.com/fan");
  fireEvent.change(screen.getByRole("textbox", { name: "소개 한 줄" }), { target: { value: "카라 팬 10년" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("저장하지 못했어요. 다시 시도해 주세요.")).toBeVisible();
});
