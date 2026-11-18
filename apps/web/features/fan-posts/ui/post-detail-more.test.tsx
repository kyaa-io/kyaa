import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MORE_ROWS, moreTitle, parseMore, PostDetailMore } from "./post-detail-more";

type State = { status: "ready"; data: { items: ReturnType<typeof post>[]; nextCursor?: string } } | { status: "loading" } | { status: "error" };
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const state = vi.hoisted(() => ({ urls: [] as string[], answer: (_url: string): State => ({ status: "loading" }), retry: vi.fn() }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: (url: string) => { state.urls.push(url); return { state: state.answer(url), retry: state.retry }; } }));
vi.mock("@/components/banner-slot/banner-slot", () => ({ BannerSlot: ({ slot }: { slot: string }) => <div data-testid="banner" data-slot={slot} /> }));

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id, celebritySlug: "elina", body: `${id} 제목\n본문`, visibility: "public", revision: 1, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" },
  assets: [], video: null, createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z", isOwner: false, likeCount: 3, liked: false, commentCount: 1, ...extra,
});
beforeEach(() => { window.history.replaceState(null, "", "/"); state.urls = []; state.retry.mockReset(); });
afterEach(cleanup);

it("reads the week ranking of the same page, leaves out the post being read and shows five rows with likes and comments", () => {
  state.answer = () => ({ status: "ready", data: { items: ["a", "current", "b", "c", "d", "e", "f"].map(id => post(id)) } });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(state.urls[0]).toBe("/api/celebrities/elina/popular-posts?period=week&locale=ko");
  const rows = screen.getAllByRole("link");
  expect(rows).toHaveLength(MORE_ROWS);
  expect(rows.map(row => row.textContent)).toEqual(["a", "b", "c", "d", "e"].map(id => `${id} 제목좋아요 3댓글 1`));
  expect(rows[0].getAttribute("href")).toMatch(/^\/c\/elina\/community\/a\?locale=ko&returnTo=%2Felina%3Ftab%3Dboard/);
  expect(screen.getByTestId("banner").dataset.slot).toBe("fanpage_second");
});

it("switches to latest in the URL, shows five loading rows, and carries the tab in other-post links", () => {
  state.answer = url => url.includes("/posts?") ? { status: "loading" } : { status: "ready", data: { items: [post("a")] } };
  const view = <PostDetailMore slug="elina" postId="current" locale="ko" />;
  const { container, rerender } = render(view);
  fireEvent.click(screen.getByRole("button", { name: "최신" }));
  expect(window.location.search).toBe("?more=latest");
  rerender(<PostDetailMore {...view.props} />);
  expect(state.urls.at(-1)).toBe("/api/celebrities/elina/posts?locale=ko&limit=5&exclude=current");
  expect(container.querySelectorAll('ul[aria-busy="true"] li')).toHaveLength(MORE_ROWS);
  state.answer = () => ({ status: "ready", data: { items: [post("b")], nextCursor: "next" } });
  rerender(<PostDetailMore {...view.props} />);
  expect(screen.getByRole("link").getAttribute("href")).toContain("more=latest");
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(state.urls.at(-1)).toContain("cursor=next");
});

it("shows the next group of ranked posts below the same heading", () => {
  state.answer = () => ({ status: "ready", data: { items: Array.from({ length: 9 }, (_, index) => post(String(index))) } });
  render(<PostDetailMore slug="elina" postId="0" locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(screen.getAllByRole("link").map(row => row.textContent?.[0])).toEqual(["6", "7", "8"]);
  expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
});

it("keeps the block height with empty rows, not loading bars, when the page has few other posts", () => {
  state.answer = () => ({ status: "ready", data: { items: [post("a"), post("current")] } });
  const { container } = render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(screen.getAllByRole("link")).toHaveLength(1);
  const empty = container.querySelectorAll("li[aria-hidden=true]");
  expect(empty).toHaveLength(MORE_ROWS - 1);
  for (const row of empty) expect(row.childElementCount).toBe(0);
});

it("leaves a zero count out, and the whole count line when both are zero", () => {
  state.answer = () => ({ status: "ready", data: { items: [post("a", { likeCount: 2, commentCount: 0 }), post("b", { likeCount: 0, commentCount: 0 })] } });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(screen.getAllByRole("link").map(row => row.textContent)).toEqual(["a 제목좋아요 2", "b 제목"]);
});

it("allows switching tabs when the selected list is empty", () => {
  state.answer = () => ({ status: "ready", data: { items: [post("current")] } });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("button", { name: "최신" })).toBeTruthy();
  expect(screen.getByTestId("banner")).toBeTruthy();
});

it("offers a retry when the list cannot be read, and no banner on a brand page", () => {
  state.answer = () => ({ status: "error" });
  render(<PostDetailMore slug="brand" postId="current" locale="ko" banner={false} />);
  fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "다시 시도" }));
  expect(state.retry).toHaveBeenCalled();
  expect(screen.queryByTestId("banner")).toBeNull();
});

it("uses the writer’s picture before the public photo and falls back to the book icon", () => {
  const asset = { id: "bba239f6-6c6b-4a36-87bf-b325dfe5d4ca", width: 640, height: 480 };
  state.answer = () => ({ status: "ready", data: { items: [
    post("photo", { assets: [asset] }),
    post("members", { visibility: "members", artist: true, assets: [asset] }),
    post("no-avatar", { author: { nickname: "팬", avatarUrl: null } }),
  ] } });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  const [photo, members, noAvatar] = screen.getAllByRole("link");
  const [avatar, thumbnail] = photo.querySelectorAll("img");
  const avatarUrl = "/images/avatars/star-pink.webp";
  expect(avatar.getAttribute("src")).toBe(avatarUrl);
  expect(thumbnail.getAttribute("src")).toBe(`/api/content-assets/${asset.id}?size=thumbnail`);
  expect(thumbnail.dataset.loaded).toBe("false");
  fireEvent.load(avatar);
  expect(avatar.dataset.loaded).toBe("true");
  expect(photo.querySelector(".lucide-book-open")).toBeNull();

  fireEvent.load(thumbnail);
  expect(thumbnail.dataset.loaded).toBe("true");
  expect(photo.querySelectorAll("img")).toHaveLength(1);
  fireEvent.error(thumbnail);
  expect(thumbnail.dataset.loaded).toBe("false");
  expect(photo.querySelector("img")?.getAttribute("src")).toBe(avatarUrl);

  const [artistAvatar] = members.querySelectorAll("img");
  expect(members.querySelectorAll("img")).toHaveLength(1);
  expect(artistAvatar.getAttribute("src")).toBe(avatarUrl);
  expect(artistAvatar.hasAttribute("data-artist-avatar")).toBe(true);
  fireEvent.load(artistAvatar);
  fireEvent.error(artistAvatar);
  expect(artistAvatar.dataset.loaded).toBe("false");
  expect(members.querySelector(".lucide-book-open")).toBeTruthy();
  expect(noAvatar.querySelector("img")).toBeNull();
  expect(noAvatar.querySelector(".lucide-book-open")).toBeTruthy();
});

it("uses the board post schema for ranking and cursor pages", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const fanPost = post(id);
  expect(parseMore({ items: [fanPost] })).toMatchObject({ items: [fanPost], nextCursor: null });
  expect(parseMore({ items: [fanPost], nextCursor: "next" }).nextCursor).toBe("next");
  expect(moreTitle({ body: "첫 줄\n둘째 줄" })).toBe("첫 줄");
});
