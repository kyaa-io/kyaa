import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CheerReplies } from "./cheer-replies";
const mocks = vi.hoisted(() => ({ auth: { ready: true, authenticated: true, user: { id: "owner-a" }, getAccessToken: async () => "token" }, request: vi.fn(), retry: vi.fn(), replies: [] as unknown[] }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => mocks.auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: mocks.auth.user.id, generation: 1 }) }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { replies: mocks.replies, nextCursor: null } }, retry: mocks.retry }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: null, request: mocks.request }) }));
const id = "10000000-0000-4000-8000-000000000001";
let state: string, amount: number, statusReads: number;
beforeEach(() => {
 mocks.auth.authenticated = true; mocks.auth.user = { id: "owner-a" }; mocks.request.mockReset().mockResolvedValue({ ok: true }); mocks.retry.mockReset(); state = "available"; amount = 37; statusReads = 0;
 vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (url.includes("earning-status")) { statusReads++; if (state === "error") return Response.json({}, { status: 503 }); return Response.json({ celebrityId: id, policy: { status: state === "unconfigured" ? "unconfigured" : "configured", version: state === "unconfigured" ? null : "v1" }, actions: state === "unconfigured" ? [] : [{ key: "comment", pointAmount: amount, scope: "daily", dailyLimit: 2, usedToday: 1, remainingToday: 1, lifetimeLimit: null, lifetimeUsed: 1, status: state, sourceId: null, ledgerId: null }] }); } throw new Error(`Unexpected GET ${url}`); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(<CheerReplies cheerId={id} slug="artist" locale="ko" returnTo="/artist#cheer" onChanged={vi.fn()} />);
it("uses the API amount and refreshes after the original reply request without promising an award", async () => {
 show(); expect(await screen.findByText("+37 P")).toBeInTheDocument(); expect(screen.getByText("조건 충족 시 · 중복 제외 · 오늘 1회 남음")).toBeInTheDocument();
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/me/mobile-fan-economy/earning-status?celebritySlug=artist");
 amount = 19; fireEvent.change(screen.getByLabelText("댓글 쓰기"), { target: { value: "reply" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
 await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/celebrities/artist/cheers?locale=ko", "POST", expect.objectContaining({ body: "reply", replyToId: id })));
 expect(await screen.findByText("+19 P")).toBeInTheDocument(); expect(statusReads).toBeGreaterThanOrEqual(2);
 expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes("sourceType=fan_post"))).toBe(true);
});
it.each(["disabled", "not_eligible", "unconfigured", "error"])("hides unavailable reward %s", async value => { state = value; show(); await waitFor(() => expect(statusReads).toBeGreaterThan(0)); expect(screen.queryByText(/\+37 P/)).toBeNull(); });
it("does not read policy for a guest", () => { mocks.auth.authenticated = false; show(); expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText(/\+37 P/)).toBeNull(); });
it("clears a previous owner's hint and reads the next owner's policy", async () => { const view = show(); await screen.findByText("+37 P"); mocks.auth.user = { id: "owner-b" }; amount = 19; view.rerender(<CheerReplies cheerId={id} slug="artist" locale="ko" returnTo="/artist#cheer" onChanged={vi.fn()} />); expect(screen.queryByText("+37 P")).toBeNull(); expect(await screen.findByText("+19 P")).toBeInTheDocument(); });
it("does not refresh earning status after a failed reply", async () => {
 mocks.request.mockResolvedValue(null); show(); await screen.findByText("+37 P");
 fireEvent.change(screen.getByLabelText("댓글 쓰기"), { target: { value: "unsent" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
 await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1)); expect(statusReads).toBe(1); expect(screen.getByLabelText("댓글 쓰기")).toHaveValue("unsent");
});
it("plays the point burst only when the reply response carries reward points", async () => {
 for (const [response, shown] of [[{ ok: true, reward: { points: 12 } }, true], [{ ok: true }, false], [{ ok: true, reward: { points: 0 } }, false]] as const) {
  cleanup(); mocks.request.mockReset().mockResolvedValue(response); show();
  fireEvent.change(screen.getByLabelText("댓글 쓰기"), { target: { value: "reply" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalled());
  await waitFor(() => expect(document.querySelector("[data-testid=point-reward-burst]") !== null).toBe(shown));
 }
});
it("shows the artist mark only for replies the server marks as artist", () => {
 const reply = (id: string, nickname: string, artist?: boolean) => ({ id, nickname, avatarUrl: "/a.png", body: "hi", createdAt: "2026-11-05T00:00:00Z", isOwner: false, ...(artist === undefined ? {} : { artist }) });
 mocks.replies = [reply("r1", "아티스트", true), reply("r2", "팬", false), reply("r3", "손님")];
 try { show(); expect(screen.getAllByText("인증 아티스트")).toHaveLength(1); expect(screen.getByText("아티스트").parentElement).toHaveTextContent("인증 아티스트"); expect(screen.getByText("팬").parentElement).not.toHaveTextContent("인증 아티스트"); expect(screen.getByText("손님").parentElement).not.toHaveTextContent("인증 아티스트"); } finally { mocks.replies = []; }
});
