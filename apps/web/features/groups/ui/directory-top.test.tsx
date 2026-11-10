import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HomeBanner } from "@/features/home/domain/home-banner";

const state = vi.hoisted(() => ({ authenticated: false, joined: [] as unknown[], joinedFails: false, posts: [] as unknown[], postsFail: false, postsLoading: false, urls: [] as string[] }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: state.authenticated, user: null, getAccessToken: async () => "t" }) }));
vi.mock("./use-group-resource", () => ({
  useGroupRequest: () => ({ ready: true, authenticated: state.authenticated, ownerKey: "o", request: vi.fn() }),
  useGroupResource: (url: string | null) => url === null ? { ready: true, authenticated: state.authenticated, loading: false, error: false, data: null }
    : { ready: true, authenticated: state.authenticated, loading: false, error: state.joinedFails, data: { items: state.joined, nextCursor: null } },
}));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({
  useCommunityResource: (url: string | null) => { if (url) state.urls.push(url); return url === null ? { state: { status: "loading" }, retry: vi.fn() }
    : state.postsFail ? { state: { status: "error" }, retry: vi.fn() }
    : state.postsLoading ? { state: { status: "loading" }, retry: vi.fn() }
    : { state: { status: "ready", data: { hasMore: false, items: state.posts } }, retry: vi.fn() }; },
}));
import { HotPosts, MyArtists, ThinCarousel } from "./directory-top";

const page = (n: number) => ({ id: `e9600000-0000-4000-8000-00000000000${n}`, kind: "fan", name: `아티스트${n}`, description: "", imageUrl: null, slug: `artist-${n}`, memberCount: n, status: "published", question: null, anonymous: false, celebrityId: null });
const post = (n: number) => ({ source: "fan", id: `a9600000-0000-4000-8000-00000000000${n % 10}`, pageRef: `artist-${n}`, pageName: `아티스트${n}`, title: `글 ${n}`, nickname: "팬", createdAt: "2026-11-09T00:00:00Z", likeCount: 20 - n, commentCount: n, viewCount: null, asset: null });
const asset = (w: number, h: number) => ({ id: "22222222-2222-4222-8222-222222222222", url: "/a.webp", width: w, height: h, mimeType: "image/webp", revision: 1 });
const banner = (strip: boolean, id = "11111111-1111-4111-8111-111111111111"): HomeBanner => ({ id, kind: "announcement", celebrityId: null, title: "배너 제목", description: "", ctaLabel: "보기", href: "/events", alt: "배너",
  desktopImage: strip ? asset(2720, 240) : asset(1200, 600), mobileImage: strip ? asset(716, 180) : asset(600, 500) });

beforeEach(() => { state.authenticated = false; state.joined = []; state.joinedFails = false; state.posts = []; state.postsFail = false; state.postsLoading = false; });
afterEach(cleanup);

it("my artists: the add slot first; a guest sees three empty rings and the sign-in button, without a new-post dot", () => {
  const { container } = render(<MyArtists locale="ko" loginPath="/pages/groups" />);
  const heading = screen.getByRole("heading", { name: "내 아티스트" });
  // The sign-in button sits on the title row, so the four circles (add + three rings) fit one row without being cut.
  expect(heading.parentElement).toContainElement(screen.getByRole("link", { name: "로그인" }));
  expect(container.querySelector("ul")).toHaveAttribute("data-ghost");
  expect(screen.getByRole("link", { name: "모임 찾기" })).toBeInTheDocument();
  expect(container.querySelectorAll("li[aria-hidden='true']")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toContain("/login");
  expect(container.querySelector("[role='img']")).toBeNull();
});

it("my artists: joined pages follow the add slot and open their page; no pages keeps the three rings; a signed-in viewer has no sign-in button", () => {
  state.authenticated = true; state.joined = [page(1), page(2)];
  const first = render(<MyArtists locale="ko" loginPath="/pages/groups" />);
  const names = [...first.container.querySelectorAll("li")].map((li) => li.textContent);
  expect(names.slice(1)).toEqual(["아티스트1", "아티스트2"]);
  expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
  expect(screen.getByRole("link", { name: "아티스트1" }).getAttribute("href")).toContain(page(1).id);
  first.unmount();
  state.joined = [];
  const second = render(<MyArtists locale="ko" loginPath="/pages/groups" />);
  expect(second.container.querySelectorAll("li[aria-hidden='true']")).toHaveLength(3);
});

it("drags the artist rail with a mouse and swipes banners without following their links", () => {
  class TestPointerEvent extends MouseEvent {
    pointerType: string; pointerId: number;
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerType = init.pointerType ?? ""; this.pointerId = init.pointerId ?? 1; }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  try {
    state.authenticated = true; state.joined = [page(1), page(2)];
    const artists = render(<MyArtists locale="ko" loginPath="/pages/groups" />);
    const rail = artists.container.querySelector("ul")!;
    fireEvent.pointerDown(rail, { pointerType: "mouse", button: 0, clientX: 100 });
    fireEvent.pointerMove(rail, { pointerType: "mouse", clientX: 50 });
    fireEvent.pointerUp(rail, { pointerType: "mouse", clientX: 50 });
    expect(rail.scrollLeft).toBe(50);
    artists.unmount();
    render(<ThinCarousel locale="ko" banners={[banner(false), banner(false, "22222222-2222-4222-8222-222222222222")]} />);
    const link = screen.getByRole("link", { name: /배너 제목/ });
    fireEvent.pointerDown(link, { pointerType: "touch", button: 0, clientX: 100 });
    fireEvent.pointerMove(link, { pointerType: "touch", clientX: 40 });
    fireEvent.pointerUp(link, { pointerType: "touch", clientX: 40 });
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(fireEvent.click(link, { detail: 1 })).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

it("hot posts: five rows from ten answers, 펼치기 shows all ten from the same answer and 접기 goes back", () => {
  state.posts = Array.from({ length: 10 }, (_, i) => post(i + 1));
  const { container } = render(<HotPosts locale="ko" />);
  const rows = () => container.querySelectorAll("ul > li");
  expect(rows()).toHaveLength(5);
  expect(screen.getByRole("link", { name: "글 1" })).toBeInTheDocument();
  expect(screen.getByText("좋아요 19")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "펼치기" }));
  expect(rows()).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "접기" }));
  expect(rows()).toHaveLength(5);
});

it("hot sort requests the selected ordering from the server", async () => {
  state.urls = [];
  state.posts = [{ ...post(1), viewCount: 7 }];
  const first = render(<HotPosts locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: /좋아요순/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "댓글순" }));
  expect(state.urls.at(-1)).toContain("sort=comments");
  first.unmount();
  render(<HotPosts locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: /좋아요순/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "조회수순" }));
  expect(state.urls.at(-1)).toContain("sort=views");
  expect(screen.getByText("조회 7")).toBeInTheDocument();
});

it("hot posts: a row draws its page's picture, or a white ring with the first letter — never the grey figure", () => {
  state.posts = [{ ...post(1), pageImageUrl: "https://x/p1.webp" }, post(2)];
  const { container } = render(<HotPosts locale="ko" />);
  const rows = container.querySelectorAll("ul > li[data-row=hot-post]");
  expect(rows[0]!.querySelector("[data-creator-avatar] img")).toHaveAttribute("src", expect.stringContaining("p1.webp"));
  expect(rows[1]!.querySelector("[data-creator-avatar]")).toBeNull();
  expect(rows[1]!.querySelector("[aria-hidden=true]")).toHaveTextContent("아");
});

it("hot posts: six answers stay six real rows when closed and fill to ten rows when open, so the open block is as high as with ten", () => {
  state.posts = Array.from({ length: 6 }, (_, i) => post(i + 1));
  const { container } = render(<HotPosts locale="ko" />);
  expect(container.querySelectorAll("ul > li")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "펼치기" }));
  expect(container.querySelectorAll("ul > li")).toHaveLength(10);
  expect(container.querySelectorAll("ul > li[data-row=hot-post]")).toHaveLength(6);
});

it("hot posts: two answers keep five rows (R8-RULE-1), zero answers say so on the first row, and the expand button stays but is off", () => {
  state.posts = [post(1), post(2)];
  const first = render(<HotPosts locale="ko" />);
  expect(first.container.querySelectorAll("ul > li")).toHaveLength(5);
  expect(first.container.querySelectorAll("ul > li[aria-hidden='true']")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "펼치기" })).toBeDisabled();
  first.unmount();
  state.posts = [];
  const second = render(<HotPosts locale="ko" />);
  expect(second.container.querySelectorAll("ul > li")).toHaveLength(5);
  expect(screen.getByText("아직 Hot 게시글 없음")).toBeInTheDocument();
  expect(second.container.querySelectorAll("ul > li[aria-hidden='true']")).toHaveLength(4);
});

it("hot posts: loading keeps five rows and an error says so with a retry", () => {
  state.postsLoading = true;
  const loading = render(<HotPosts locale="ko" />);
  expect(loading.container.querySelectorAll("ul > li")).toHaveLength(5);
  loading.unmount();
  state.postsLoading = false; state.postsFail = true;
  render(<HotPosts locale="ko" />);
  expect(screen.getByText("게시글을 불러오지 못했어요")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});

it("thin banner: a strip picture fills the band and is one link; another picture keeps the white band with a thumbnail and the title", () => {
  const strip = render(<ThinCarousel banners={[banner(true)]} locale="ko" />);
  expect(strip.container.querySelector("section")).toHaveAttribute("data-fill", "true");
  expect(screen.getByRole("link", { name: "배너 제목" }).getAttribute("href")).toBe("/events?locale=ko");
  expect(screen.queryByRole("button", { name: "다음 배너" })).toBeNull();
  strip.unmount();
  const thumb = render(<ThinCarousel banners={[banner(false)]} locale="ko" />);
  expect(thumb.container.querySelector("section")).not.toHaveAttribute("data-fill");
  expect(within(screen.getByRole("link")).getByText("배너 제목")).toBeInTheDocument();
});

it("thin banner: draws nothing without banners, and two banners move with the arrows and wrap around", () => {
  const none = render(<ThinCarousel banners={[]} locale="ko" />);
  expect(none.container.firstChild).toBeNull();
  none.unmount();
  render(<ThinCarousel banners={[banner(true), banner(false, "33333333-3333-4333-8333-333333333333")]} locale="ko" />);
  expect(screen.getByText("1/2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음 배너" }));
  expect(screen.getByText("2/2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음 배너" }));
  expect(screen.getByText("1/2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전 배너" }));
  expect(screen.getByText("2/2")).toBeInTheDocument();
});

it("my artists shows the default artwork for a joined group without an image", () => {
  state.authenticated = true; state.joined = [{ ...page(1), kind: "hobby", slug: null }];
  render(<MyArtists locale="ko" loginPath="/pages/groups" />);
  expect(within(screen.getByRole("link", { name: "아티스트1" })).getByRole("presentation")).toHaveAttribute("src", "/images/groups/music-placeholder.svg");
});
