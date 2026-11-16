import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeNoticeParticipation } from "./home-notice-participation";

const state = vi.hoisted(() => ({ authenticated: true, owner: "fixture-a", generation: 1, status: "ready", participation: { reaction: null as "like"|"dislike"|null, likeCount: 2, dislikeCount: null, commentCount: 0 }, retry: vi.fn(), comments: [] as Array<unknown>, eventCount: 2, eventLiked: false }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: state.authenticated, user: state.authenticated ? { id: state.owner } : null, getAccessToken: async () => "fixture" }), useByUsAuthStatus: () => ({ ready: true }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: state.owner, generation: state.generation }) }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: (url: string | null) => ({ state: !url ? { status: "loading" } : state.status === "ready" ? { status: "ready", data: url.includes("/participation") ? state.participation : url.includes("/celebrities/x-opening-1116/fans") ? { likeCount: state.eventCount } : url.includes("/celebrities/x-opening-1116/reactions") ? { reaction: state.eventLiked ? { reactionId: "a0000000-0000-4000-8000-000000000001", status: "completed", mintStatus: "queued", blockchainJobId: null, created: false, passportExists: false } : null } : { items: state.comments, nextCursor: null } } : { status: state.status, code: "UNAVAILABLE" }, retry: state.retry }) }));
const props = { slug: "service-guide", title: "팬 활동을 시작하는 방법", locale: "ko" as const };
beforeEach(() => { state.authenticated = true; state.owner = "fixture-a"; state.generation = 1; state.status = "ready"; state.participation = { reaction: null, likeCount: 2, dislikeCount: null, commentCount: 0 }; state.comments = []; state.eventCount = 2; state.eventLiked = false; state.retry.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("sends guests to this CMS detail after login and hides dislike counts", () => {
  state.authenticated = false;
  render(<HomeNoticeParticipation {...props} />);
  const like = screen.getByRole("link", { name: "좋아요 2" });
  expect(new URL(like.getAttribute("href")!, "https://kyaa.test").searchParams.get("returnTo")).toBe("/notices/service-guide?locale=ko");
  expect(screen.getByRole("link", { name: "싫어요" }).textContent).toBe("");
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("counts the mission book like as the X Opening event like: shows event likes plus 10, brings guests back to the page, posts once to the event", async () => {
  const mission = { slug: "dukjil-missionbook", title: "덕질미션북", locale: "ko" as const, returnPath: "/guide/dukjil" };
  state.authenticated = false;
  const view = render(<HomeNoticeParticipation {...mission} />);
  const like = screen.getByRole("link", { name: "좋아요 12" });
  expect(new URL(like.getAttribute("href")!, "https://kyaa.test").searchParams.get("returnTo")).toBe("/guide/dukjil?locale=ko");
  view.unmount();
  state.authenticated = true;
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ reactionId: "a0000000-0000-4000-8000-000000000001", status: "completed", mintStatus: "queued", blockchainJobId: null, created: true, passportExists: false }));
  vi.stubGlobal("fetch", fetch);
  render(<HomeNoticeParticipation {...mission} />);
  fireEvent.click(screen.getByRole("button", { name: "좋아요 12" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "좋아요 13" })).toHaveAttribute("aria-pressed", "true"));
  expect(fetch.mock.calls).toHaveLength(1);
  expect(fetch.mock.calls[0]![0]).toBe("/api/celebrities/x-opening-1116/reactions");
  expect(fetch.mock.calls[0]![1].method).toBe("POST");
  fireEvent.click(screen.getByRole("button", { name: "좋아요 13" }));
  expect(fetch.mock.calls).toHaveLength(1);
  expect(screen.getByRole("button", { name: "싫어요" })).toBeDisabled();
});
it("shows the mission book like as already pressed when this account joined the event at /follow", () => {
  state.eventLiked = true; state.eventCount = 5;
  render(<HomeNoticeParticipation slug="dukjil-missionbook" title="덕질미션북" locale="ko" returnPath="/guide/dukjil" />);
  expect(screen.getByRole("button", { name: "좋아요 15" })).toHaveAttribute("aria-pressed", "true");
});
it("keeps the mission book dislike on the notice", async () => {
  state.owner = "fixture-dislike";
  const fetch = vi.fn(async (_url: string, init: RequestInit) => Response.json({ reaction: JSON.parse(String(init.body)).reaction, likeCount: 0, dislikeCount: null, commentCount: 0 }));
  vi.stubGlobal("fetch", fetch);
  render(<HomeNoticeParticipation slug="dukjil-missionbook" title="덕질미션북" locale="ko" returnPath="/guide/dukjil" />);
  fireEvent.click(screen.getByRole("button", { name: "싫어요" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "싫어요" })).toHaveAttribute("aria-pressed", "true"));
  expect(fetch.mock.calls[0]![0]).toBe("/api/notices/dukjil-missionbook/reaction");
  expect(screen.getByRole("button", { name: "좋아요 12" })).toHaveAttribute("aria-pressed", "false");
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
it("uses the shared heading, row marker and absolute Seoul timestamp for a comment", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-10T00:00:00Z"));
  state.participation = { ...state.participation, commentCount: 1 };
  state.comments = [{ id: "b0000000-0000-4000-8000-000000000001", body: "감사합니다.", revision: 1, createdAt: "2026-11-10T00:00:00Z", isOwner: false, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" } }];
  render(<HomeNoticeParticipation {...props} />);
  expect(screen.getByRole("heading", { name: "댓글 1" })).toHaveAttribute("data-fan-heading", "standard");
  const row = screen.getByText("감사합니다.").closest("li")!;
  expect(row).toHaveAttribute("data-row", "comment");
  expect(row.querySelector("time")).toHaveAttribute("dateTime", "2026-11-10T00:00:00Z");
  expect(row.querySelector("time")).toHaveTextContent("11. 10. 09:00");
});
