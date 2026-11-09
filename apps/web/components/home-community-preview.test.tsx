import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { notifyFanActivityUpdated } from "./fan-ui/fan-activity-updates";
import { HomeCommunityPreview } from "./home-community-preview";
import { SESSION_HINT_KEY } from "@/features/auth/client/session-hint";

const auth = vi.hoisted(() => ({ ready: true, authenticated: false, user: { id: "owner-a" }, getAccessToken: vi.fn(async () => "token-a" as string | null) }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "owner-a", generation: 0 }));
// B6: which author names open a profile is asked separately; these tests are about the rows.
vi.mock("@/features/group-social/profile-window", () => ({ ProfileAuthor: ({ children }: { children: unknown }) => children }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const post = (n: number, title: string, extra: Record<string, unknown> = {}) => ({ source: "fan", id: uuid(n), pageRef: "elina", pageName: "엘리나", title, nickname: "팬", createdAt: "2026-10-19T01:00:00Z", likeCount: 0, commentCount: 0, viewCount: null, asset: null, ...extra });
const page = (items: unknown[], hasMore = false) => Response.json({ items, hasMore });
beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals(); auth.ready = true; auth.authenticated = false; auth.user.id = "owner-a";
  auth.getAccessToken.mockReset().mockResolvedValue("token-a");
  session.ready = true; session.ownerId = "owner-a"; session.generation = 0;
});

it("reads the popular board once as a guest and renders dense rows with the origin page, author and time on the right", async () => {
  const fetcher = vi.fn(async () => page([
    post(1, "팬 인기 글", { likeCount: 1234, commentCount: 5 }),
    post(2, "모임 글", { source: "group", pageRef: "22222222-2222-4222-8222-222222222222", pageName: "취미 모임", viewCount: 9 }),
  ]));
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("팬 인기 글");
  expect(screen.getByText("[5]")).toHaveAttribute("aria-label", "댓글 5");
  expect(screen.getByRole("link", { name: "엘리나" })).toHaveAttribute("href", "/community?creator=elina&tab=posts&locale=ko");
  expect(screen.getByRole("link", { name: "취미 모임" })).toHaveAttribute("href", "/pages/groups/22222222-2222-4222-8222-222222222222?locale=ko&tab=board");
  expect(screen.getByRole("link", { name: "팬 인기 글" }).getAttribute("href")).toMatch(new RegExp(`^/c/elina/community/${uuid(1)}\\?locale=ko&returnTo=`));
  expect(screen.getByRole("link", { name: "모임 글" })).toHaveAttribute("href", `/pages/groups/22222222-2222-4222-8222-222222222222?locale=ko&tab=board&post=${uuid(2)}`);
  expect(container.querySelectorAll("[data-fan-post-row][data-density='home']")).toHaveLength(2);
  expect(container.querySelector("[data-fan-post-row]")?.textContent).not.toMatch(/—|1,234/);
  expect(screen.queryByText("조회")).not.toBeInTheDocument();
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

const anonymousRead = expect.objectContaining({ headers: undefined });
const viewerRead = expect.objectContaining({ headers: { Authorization: "Bearer token-a" } });
const popular = "/api/public/popular-posts?locale=ko&page=1";

it("replaces the public rows with the viewer read on sign-in, so a blocked author leaves, and refreshes on activity", async () => {
  let blocked = false;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page(init?.headers ? blocked ? [] : [post(2, "차단 전 공개 글")] : [post(1, "로그인 전 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("로그인 전 공개 글");
  auth.authenticated = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("로그인 전 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(popular, viewerRead));
  await screen.findByText("차단 전 공개 글");
  blocked = true;
  act(() => notifyFanActivityUpdated("owner-a", ["community"]));
  expect(screen.queryByText("차단 전 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.headers).length).toBe(2));
  await waitFor(() => expect(screen.queryByText("차단 전 공개 글")).not.toBeInTheDocument());
});

it("never paints public rows for a signed-in viewer whose session is still being confirmed", async () => {
  auth.authenticated = true; session.ready = false;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page(init?.headers ? [post(2, "회원 읽기 글")] : [post(1, "차단한 작성자의 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByText("차단한 작성자의 공개 글")).not.toBeInTheDocument();
  session.ready = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("회원 읽기 글");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(popular, viewerRead);
});

it("keeps the skeleton while auth is unknown on a device that holds a session mark", async () => {
  auth.ready = false; localStorage.setItem(SESSION_HINT_KEY, "1");
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page(init?.headers ? [post(2, "회원 읽기 글")] : [post(1, "차단한 작성자의 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
  auth.ready = true; auth.authenticated = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("회원 읽기 글");
  expect(screen.queryByText("차단한 작성자의 공개 글")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(popular, viewerRead);
});

it("treats a stored wallet token as a possible session too", async () => {
  auth.ready = false; localStorage.setItem("privy:token", "x");
  const fetcher = vi.fn(async () => page([post(1, "차단한 작성자의 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  await act(async () => {});
  expect(fetcher).not.toHaveBeenCalled();
});

it("shows a visitor with no session mark the public rows without waiting for auth", async () => {
  auth.ready = false;
  const fetcher = vi.fn(async () => page([post(1, "방문자 공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("방문자 공개 글");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(popular, anonymousRead);
});

it("hides public rows the moment auth turns out signed in, before the viewer read answers", async () => {
  auth.ready = false;
  let finish!: (r: Response) => void;
  const fetcher = vi.fn((_url: string, init?: RequestInit) => init?.headers ? new Promise<Response>(done => { finish = done; }) : Promise.resolve(page([post(1, "차단한 작성자의 공개 글")])));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("차단한 작성자의 공개 글");
  auth.ready = true; auth.authenticated = true; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("차단한 작성자의 공개 글")).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(popular, viewerRead));
  await act(async () => finish(page([post(2, "회원 읽기 글")])));
  await screen.findByText("회원 읽기 글");
});

it("ignores a late response from the previous account and never falls back to guest data for a missing token", async () => {
  auth.authenticated = true;
  let resolveOld!: (value: Response) => void;
  const oldResponse = new Promise<Response>(done => { resolveOld = done; });
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.headers ? oldResponse : page([post(3, "공개 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(popular, viewerRead));
  auth.user.id = "owner-b"; session.ownerId = "owner-b"; session.generation++;
  auth.getAccessToken.mockResolvedValue(null);
  view.rerender(<HomeCommunityPreview locale="ko" />);
  await screen.findByRole("button", { name: "다시 시도" });
  expect(screen.queryByText("공개 글")).not.toBeInTheDocument();
  await act(async () => resolveOld(page([post(1, "이전 계정의 늦은 글")])));
  expect(screen.queryByText("이전 계정의 늦은 글")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([, init]) => init?.headers)).toHaveLength(1);
  view.unmount();
});

it("clears the owner snapshot immediately on logout and shows public guest data", async () => {
  auth.authenticated = true;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => page([post(1, init?.headers ? "이전 로그인 상태의 글" : "공개 방문자 글")]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("이전 로그인 상태의 글");
  auth.authenticated = false; session.generation++;
  view.rerender(<HomeCommunityPreview locale="ko" />);
  expect(screen.queryByText("이전 로그인 상태의 글")).not.toBeInTheDocument();
  await screen.findByText("공개 방문자 글");
  expect(fetcher.mock.calls.at(-1)?.[1]?.headers ?? null).toBeNull();
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

it("shows a real thumbnail from the public thumbnail routes only for posts with an attachment", async () => {
  const asset = { id: "33333333-3333-4333-8333-333333333333", width: 1600, height: 1200 };
  vi.stubGlobal("fetch", vi.fn(async () => page([
    post(1, "사진 모임 글", { source: "group", pageRef: "22222222-2222-4222-8222-222222222222", pageName: "취미 모임", viewCount: 0, asset }),
    post(2, "사진 팬 글", { asset: { ...asset, id: "44444444-4444-4444-8444-444444444444" } }),
    post(3, "사진 없는 글"),
  ])));
  const { container } = render(<HomeCommunityPreview locale="ko" />);
  await screen.findByText("사진 없는 글");
  const sources = [...container.querySelectorAll("[data-fan-post-row] img")].map(image => image.getAttribute("src"));
  expect(sources).toEqual([`/api/groups/media/${asset.id}?variant=thumbnail`, "/api/content-assets/44444444-4444-4444-8444-444444444444?size=thumbnail"]);
  expect(container.querySelectorAll("[data-fan-post-row] svg")).toHaveLength(1);
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
