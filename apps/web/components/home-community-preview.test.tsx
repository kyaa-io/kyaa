import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { notifyFanActivityUpdated } from "./fan-ui/fan-activity-updates";
import { HomeCommunityPreview } from "./home-community-preview";

const auth = vi.hoisted(() => ({ ready: true, authenticated: false, user: { id: "owner-a" }, getAccessToken: vi.fn(async () => "token-a" as string | null) }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "owner-a", generation: 0 }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const post = (n: number, title: string, extra: Record<string, unknown> = {}) => ({ source: "fan", id: uuid(n), pageRef: "elina", pageName: "엘리나", title, nickname: "팬", createdAt: "2026-10-19T01:00:00Z", likeCount: 0, commentCount: 0, viewCount: null, asset: null, ...extra });
const page = (items: unknown[], hasMore = false) => Response.json({ items, hasMore });
beforeEach(() => {
  vi.unstubAllGlobals(); auth.ready = true; auth.authenticated = false; auth.user.id = "owner-a";
  auth.getAccessToken.mockReset().mockResolvedValue("token-a");
  session.ready = true; session.ownerId = "owner-a"; session.generation = 0;
});

it("reads the popular board once as a guest and renders table columns with the origin page under the title", async () => {
  const fetcher = vi.fn(async () => page([
    post(1, "팬 인기 글", { likeCount: 1234, commentCount: 5 }),
    post(2, "모임 글", { source: "group", pageRef: "22222222-2222-4222-8222-222222222222", pageName: "취미 모임", viewCount: 9 }),
  ]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("팬 인기 글 (5)");
  expect(screen.getByText("엘리나")).toBeInTheDocument();
  expect(screen.getByText("취미 모임")).toBeInTheDocument();
  const links = screen.getAllByRole("link");
  expect(links[0]).toHaveAttribute("href", "/community?creator=elina&tab=posts&locale=ko");
  expect(links[1]).toHaveAttribute("href", `/pages/groups/22222222-2222-4222-8222-222222222222?locale=ko&tab=board&post=${uuid(2)}`);
  expect(screen.getByText("1,234")).toBeInTheDocument();
  expect(screen.getAllByText("—")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/public/popular-posts?locale=ko&page=1", expect.objectContaining({ headers: undefined, cache: "no-store" }));
  expect(auth.getAccessToken).not.toHaveBeenCalled();
});

it("offers a retry and then a general community route when nothing is public", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 })).mockImplementation(async () => page([]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Fan board" })).toHaveAttribute("href", "/community?locale=en");
});

it("rejects a malformed payload instead of showing it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => page([{ ...post(1, "잘못된 글"), visibility: "members" }])));
  render(<HomeCommunityPreview locale="ko" />);
  expect(await screen.findByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  expect(screen.queryByText("잘못된 글")).not.toBeInTheDocument();
});

it("clears guest content on sign-in, passes the viewer token, and refreshes on activity", async () => {
  let blocked = false;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page(init?.headers ? blocked ? [] : [post(2, "차단 전 공개 글")] : [post(1, "로그인 전 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("로그인 전 공개 글");
  auth.authenticated = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("로그인 전 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/public/popular-posts?locale=ko&page=1", expect.objectContaining({ headers: { Authorization: "Bearer token-a" } })));
  await screen.findByText("차단 전 공개 글");
  blocked = true;
  act(() => notifyFanActivityUpdated("owner-a", ["community"]));
  expect(screen.queryByText("차단 전 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
});

it("waits for an authenticated session instead of reading an anonymous snapshot", async () => {
  auth.authenticated = true; session.ready = false;
  const fetcher = vi.fn(async () => page([post(1, "로그인 확인 후 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
  session.ready = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("로그인 확인 후 공개 글");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/public/popular-posts?locale=ko&page=1", expect.objectContaining({ headers: { Authorization: "Bearer token-a" } }));
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
  await act(async () => resolveOld(page([post(1, "이전 계정의 늦은 글")])));
  expect(screen.queryByText("이전 계정의 늦은 글")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
  view.unmount();
});

it("clears the owner snapshot immediately on logout and reloads public guest data", async () => {
  auth.authenticated = true;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page([post(1, init?.headers ? "이전 로그인 상태의 글" : "공개 방문자 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("이전 로그인 상태의 글");
  auth.authenticated = false; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("이전 로그인 상태의 글")).not.toBeInTheDocument();
  await screen.findByText("공개 방문자 글");
  expect(fetcher).toHaveBeenLastCalledWith("/api/public/popular-posts?locale=ko&page=1", expect.objectContaining({ headers: undefined }));
});

it("keeps the visible posts during a return refresh", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(page([post(1, "유지되는 글")])).mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("유지되는 글");
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.getByText("유지되는 글")).toBeInTheDocument();
  await act(async () => finish(page([post(2, "갱신된 글")])));
  await screen.findByText("갱신된 글");
});

it("shows a post title in its original language without changing it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => page([post(1, "応援しています！")])));
  render(<HomeCommunityPreview locale="ko" />);
  expect(await screen.findByText("応援しています！")).toBeInTheDocument();
});

it("shows a thumbnail slot only for posts with an attachment and loads group images from the group media route", async () => {
  let intersect: IntersectionObserverCallback | undefined;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { if (target.hasAttribute("data-content-asset-placeholder")) intersect = this.callback; }
    unobserve() {} disconnect() {}
  });
  const asset = { id: "33333333-3333-4333-8333-333333333333", width: 1600, height: 1200 };
  const fetcher = vi.fn(async (url: string) => url.startsWith("/api/groups/media/") ? new Response(null, { status: 404 }) : page([
    post(1, "사진 모임 글", { source: "group", pageRef: "22222222-2222-4222-8222-222222222222", pageName: "취미 모임", viewCount: 0, asset }),
    post(2, "사진 없는 글"),
  ]));
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("사진 없는 글");
  expect(container.querySelectorAll("[data-content-asset-placeholder]")).toHaveLength(1);
  act(() => intersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(`/api/groups/media/${asset.id}?variant=thumbnail`, expect.any(Object)));
});

it("shows ten posts per page and returns through previous and next controls", async () => {
  const fetcher = vi.fn(async (url: string) => {
    const second = url.includes("page=2");
    return page(Array.from({ length: second ? 2 : 10 }, (_, i) => post(i + (second ? 11 : 1), `게시물 ${i + (second ? 11 : 1)}`)), !second);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("게시물 1");
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByText("게시물 11");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByText("게시물 1");
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
});
