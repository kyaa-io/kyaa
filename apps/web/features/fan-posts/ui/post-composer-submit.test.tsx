import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PostComposer } from "./post-composer";
const mocks = vi.hoisted(() => ({ request: vi.fn(), busy: false, failure: undefined as undefined | { status: number; code: string } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "viewer" } }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "viewer", generation: 1 }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ ownerKey: "viewer" }),
  useGroupResource: () => ({ data: null, error: new Error("policy"), failure: mocks.failure, loading: false, retry: vi.fn(), state: { status: "error" } }),
}));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ request: mocks.request, busy: mocks.busy, error: null }) }));
afterEach(() => { cleanup(); mocks.busy = false; mocks.failure = undefined; mocks.request.mockReset(); });
it("keeps text-only submit enabled when the attachment policy request failed", () => {
  render(<PostComposer slug="artist" locale="en" onSaved={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox", { name: /./ }), { target: { value: "hello" } });
  const submit = document.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(submit).not.toBeDisabled();
});
it("shows the shared loading state on the submit button while saving", () => {
  mocks.busy = true;
  render(<PostComposer slug="artist" locale="en" onSaved={vi.fn()} />);
  const submit = document.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(submit).toHaveAttribute("aria-busy", "true"); expect(submit).toBeDisabled();
});
it("shows the member guidance and blocks input before writing when the policy read answers 403", () => {
  mocks.failure = { status: 403, code: "FAN_WEB_FORBIDDEN" };
  render(<PostComposer slug="artist" locale="ko" onSaved={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("이 아티스트의 발급된 패스포트가 필요해요.");
  expect(screen.getByRole("link")).toHaveAttribute("href", `/c/artist/verify?locale=ko&returnTo=${encodeURIComponent("/artist?locale=ko")}`);
  expect(screen.getByRole("textbox", { name: /./ })).toBeDisabled();
  expect(document.querySelector<HTMLButtonElement>("button[type=submit]")).toBeDisabled();
});
it("keeps text submit open when the policy read answers 503", () => {
  mocks.failure = { status: 503, code: "FAN_WEB_UNAVAILABLE" };
  render(<PostComposer slug="artist" locale="ko" onSaved={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: /./ })).not.toBeDisabled();
  expect(screen.queryByRole("link")).toBeNull();
});
const submitText = async (onSaved: (reward?: { points: number }) => void) => {
  render(<PostComposer slug="artist" locale="en" onSaved={onSaved} />);
  fireEvent.change(screen.getByRole("textbox", { name: /./ }), { target: { value: "hello" } });
  fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(mocks.request).toHaveBeenCalled());
};
it("hands the server reward points to onSaved after a new post", async () => {
  mocks.request.mockResolvedValue({ id: "p1", reward: { points: 30 } });
  const onSaved = vi.fn(); await submitText(onSaved);
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ points: 30, stamps: 0 }));
});
it("passes no reward when the response has none, a replay, or an invalid value", async () => {
  for (const response of [{ id: "p1" }, { id: "p1", reward: { points: 0 } }, { id: "p1", reward: { points: "30" } }]) {
    cleanup(); mocks.request.mockReset(); mocks.request.mockResolvedValue(response);
    const onSaved = vi.fn(); await submitText(onSaved);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined));
  }
});
