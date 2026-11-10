import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeNoticeParticipation } from "./home-notice-participation";

const state = vi.hoisted(() => ({ authenticated: true, owner: "fixture-a", generation: 1, status: "ready", participation: { reaction: null as "like"|"dislike"|null, likeCount: 2, dislikeCount: null, commentCount: 0 }, retry: vi.fn(), comments: [] as Array<unknown> }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: state.authenticated, user: state.authenticated ? { id: state.owner } : null, getAccessToken: async () => "fixture" }), useByUsAuthStatus: () => ({ ready: true }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: state.owner, generation: state.generation }) }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: (url: string) => ({ state: state.status === "ready" ? { status: "ready", data: url.includes("/participation") ? state.participation : { items: state.comments, nextCursor: null } } : { status: state.status, code: "UNAVAILABLE" }, retry: state.retry }) }));
const props = { slug: "service-guide", title: "팬 활동을 시작하는 방법", locale: "ko" as const };
beforeEach(() => { state.authenticated = true; state.owner = "fixture-a"; state.generation = 1; state.status = "ready"; state.participation = { reaction: null, likeCount: 2, dislikeCount: null, commentCount: 0 }; state.comments = []; state.retry.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("sends guests to this CMS detail after login and hides dislike counts", () => {
  state.authenticated = false;
  render(<HomeNoticeParticipation {...props} />);
  const like = screen.getByRole("link", { name: "좋아요 2" });
  expect(new URL(like.getAttribute("href")!, "https://kyaa.test").searchParams.get("returnTo")).toBe("/notices/service-guide?locale=ko");
  expect(screen.getByRole("link", { name: "싫어요" }).textContent).toBe("");
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("switches and cancels reactions using the server result", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const choice = JSON.parse(String(init.body)).reaction;
    return Response.json({ reaction: choice === "none" ? null : choice, likeCount: choice === "like" ? 3 : 2, dislikeCount: null, commentCount: 0 });
  });
  vi.stubGlobal("fetch", fetch);
  render(<HomeNoticeParticipation {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "좋아요 2" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "좋아요 3" })).toHaveAttribute("aria-pressed", "true"));
  fireEvent.click(screen.getByRole("button", { name: "싫어요" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "싫어요" })).toHaveAttribute("aria-pressed", "true"));
  fireEvent.click(screen.getByRole("button", { name: "싫어요" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "싫어요" })).toHaveAttribute("aria-pressed", "false"));
  expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)).reaction)).toEqual(["like", "dislike", "none"]);
});
it("rolls a failed optimistic reaction back and shows the error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "FAN_WEB_UNAVAILABLE" } }, { status: 503 })));
  render(<HomeNoticeParticipation {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "좋아요 2" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "좋아요 2" })).toHaveAttribute("aria-pressed", "false"));
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
it("retains a failed draft and retry key, then clears only on a successful write without new reward copy", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: "FAN_WEB_UNAVAILABLE" } }, { status: 503 })).mockResolvedValueOnce(Response.json({ id: "b0000000-0000-4000-8000-000000000001", revision: 1, replayed: true }));
  vi.stubGlobal("fetch", fetch);
  render(<HomeNoticeParticipation {...props} />);
  const field = screen.getByRole("textbox");
  fireEvent.change(field, { target: { value: "감사합니다." } });
  fireEvent.submit(field.closest("form")!);
  await screen.findByRole("alert");
  expect(field).toHaveValue("감사합니다.");
  fireEvent.submit(field.closest("form")!);
  await waitFor(() => expect(field).toHaveValue(""));
  const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(state.retry).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/포인트|적립/)).toBeNull();
});
it("resets drafts and selected reactions across account generations", () => {
  state.participation = { ...state.participation, reaction: "like" };
  const view = render(<HomeNoticeParticipation {...props} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "이전 계정의 초안" } });
  state.owner = "fixture-b"; state.generation++; state.participation = { ...state.participation, reaction: null };
  view.rerender(<HomeNoticeParticipation {...props} />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.getByRole("button", { name: "좋아요 2" })).toHaveAttribute("aria-pressed", "false");
});
it("shows retry for an unavailable read while keeping the existing share action", () => {
  state.status = "error";
  render(<HomeNoticeParticipation {...props} />);
  expect(screen.getByRole("button", { name: `공유: ${props.title}` })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /다시/ }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: /좋아요/ })).toBeNull();
});
