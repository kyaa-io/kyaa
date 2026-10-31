import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { notifyFanActivityUpdated } from "./fan-ui/fan-activity-updates";
import { HomeCommunityPreview } from "./home-community-preview";

const auth = vi.hoisted(() => ({ ready: true, authenticated: false, user: { id: "owner-a" }, getAccessToken: vi.fn(async () => "token-a" as string | null) }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "owner-a", generation: 0 }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
const post = (id: number, body: string, visibility = "public", createdAt = "2026-10-19T01:00:00Z") => ({ kind: "fan_post", id: `11111111-1111-4111-8111-${String(id).padStart(12, "0")}`, celebritySlug: "elina", body, visibility, revision: 1, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt, updatedAt: createdAt, isOwner: false, likeCount: 0, liked: false, commentCount: 0 });
const preview = (item: unknown, creatorSlug = "elina") => ({ creatorSlug, creatorName: creatorSlug, item });
const page = (items: unknown[]) => Response.json({ items });
beforeEach(() => {
  vi.unstubAllGlobals(); auth.ready = true; auth.authenticated = false; auth.user.id = "owner-a";
  auth.getAccessToken.mockReset().mockResolvedValue("token-a");
  session.ready = true; session.ownerId = "owner-a"; session.generation = 0;
});

it("reads the global public preview once, keeping original text and time order without guest authorization", async () => {
  const fetcher = vi.fn(async () => page([preview(post(1, "원문 그대로\n응원해요")), preview(post(2, "먼저 보이는 최신 글", "public", "2026-10-19T03:00:00Z"), "changha"), preview(post(3, "세 번째 글", "public", "2026-10-19T00:00:00Z"))]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("먼저 보이는 최신 글");
  expect(screen.getByText(/원문 그대로/).textContent).toBe("원문 그대로\n응원해요");
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(3);
  expect(links[0]).toHaveAttribute("href", "/community?creator=changha&tab=posts&locale=ko");
  expect(links[0]).toHaveTextContent("changha · 팬게시판");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/public/home-feed?locale=ko", expect.objectContaining({ headers: undefined, cache: "no-store" }));
  expect(auth.getAccessToken).not.toHaveBeenCalled();
});

it("rejects member-only content and offers a retry", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(page([preview(post(1, "회원 전용", "members"))])).mockImplementation(async () => page([preview(post(2, "공개 글"))]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(screen.queryByText("회원 전용")).not.toBeInTheDocument();
  await screen.findByText("공개 글");
});

it("offers a general community route after an unavailable feed recovers with no public posts", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 })).mockImplementation(async () => page([]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Fan board" })).toHaveAttribute("href", "/community?locale=en");
});

it("clears guest content on sign-in, passes the viewer token, and refreshes blocked-author context", async () => {
  let blocked = false;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page(init?.headers ? blocked ? [] : [preview(post(2, "차단 전 공개 글"))] : [preview(post(1, "로그인 전 공개 글"))]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("로그인 전 공개 글");
  auth.authenticated = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("로그인 전 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/public/home-feed?locale=ko", expect.objectContaining({ headers: { Authorization: "Bearer token-a" } })));
  await screen.findByText("차단 전 공개 글");
  blocked = true;
  act(() => notifyFanActivityUpdated("owner-a", ["community"]));
  expect(screen.queryByText("차단 전 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(screen.queryByText("로그인 전 공개 글")).not.toBeInTheDocument();
  expect(screen.queryByText("차단 전 공개 글")).not.toBeInTheDocument();
});

it("ignores a late response from the previous account and never falls back to guest data for a missing token", async () => {
  auth.authenticated = true;
  let resolveOld!: (value: Response) => void;
  const oldResponse = new Promise<Response>(done => { resolveOld = done; });
  const fetcher = vi.fn().mockReturnValueOnce(oldResponse).mockImplementation(async () => page([]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  auth.user.id = "owner-b"; session.ownerId = "owner-b"; session.generation++;
  auth.getAccessToken.mockResolvedValue(null);
  view.rerender(<HomeCommunityPreview locale="ko" />);
  await screen.findByRole("button", { name: "다시 시도" });
  await act(async () => resolveOld(page([preview(post(1, "이전 계정의 늦은 글"))])));
  expect(screen.queryByText("이전 계정의 늦은 글")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
  view.unmount();
});

it("shows public cheers without changing the source language", async () => {
  const cheer = { kind: "cheer", id: "11111111-1111-4111-8111-111111111111", body: "応援しています！", nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp", createdAt: "2026-10-19T00:00:00Z", isOwner: false, clapCount: 0, viewerClapped: false, replyCount: 0 };
  vi.stubGlobal("fetch", vi.fn(async () => page([preview(cheer)])));
  render(<HomeCommunityPreview locale="ja" />);
  expect(await screen.findByText("応援しています！")).toBeInTheDocument();
});


it("clears the owner snapshot immediately on logout and reloads public guest data", async () => {
  auth.authenticated = true;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page([preview(post(1, init?.headers ? "이전 로그인 상태의 글" : "공개 방문자 글"))]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("이전 로그인 상태의 글");
  auth.authenticated = false; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("이전 로그인 상태의 글")).not.toBeInTheDocument();
  await screen.findByText("공개 방문자 글");
  expect(fetcher).toHaveBeenLastCalledWith("/api/public/home-feed?locale=ko", expect.objectContaining({ headers: undefined }));
});

it("waits for an authenticated session instead of reading an anonymous snapshot while it synchronizes", async () => {
  auth.authenticated = true; session.ready = false;
  const fetcher = vi.fn(async () => page([preview(post(1, "로그인 확인 후 공개 글"))]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
  session.ready = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("로그인 확인 후 공개 글");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/public/home-feed?locale=ko", expect.objectContaining({ headers: { Authorization: "Bearer token-a" } }));
});

it("keeps the visible posts during a return refresh", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(page([preview(post(1, "유지되는 글"))])).mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  vi.stubGlobal("fetch",fetcher);
  render(<HomeCommunityPreview locale="ko"/>);
  await screen.findByText("유지되는 글");
  fireEvent(window,new Event("focus"));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.getByText("유지되는 글")).toBeInTheDocument();
  await act(async()=>finish(page([preview(post(2,"갱신된 글"))])));
  await screen.findByText("갱신된 글");
});

it("prioritizes older photo/video posts and gives guests a usable video link", async () => {
  const photo = { ...post(1, "오래된 사진", "public", "2026-10-01T01:00:00Z"), assets: [{ id: "22222222-2222-4222-8222-222222222222", width: 400, height: 300 }] };
  const video = { ...post(2, "공개 영상", "public", "2026-10-02T01:00:00Z"), video: { id: "33333333-3333-4333-8333-333333333333", width: 400, height: 300, durationSeconds: 1 } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("/api/content-assets/") ? new Response(null, { status: 404 }) : page([preview(post(3, "최신 텍스트")), preview(photo), preview(video)])));
  render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("공개 영상");
  expect(screen.getAllByRole("listitem").map(item => item.querySelector("p")?.textContent)).toEqual(["공개 영상", "오래된 사진", "최신 텍스트"]);
  expect(screen.getAllByRole("listitem")[0].querySelector("a")).toHaveAttribute("href", "/community?creator=elina&tab=posts&locale=ko");
  expect(screen.getAllByRole("listitem")[0].querySelector('[role="status"]')).toBeNull();
});
