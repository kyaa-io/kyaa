import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MORE_ROWS, moreTitle, parseMore, PostDetailMore } from "./post-detail-more";

type State = { status: "ready"; data: unknown[] } | { status: "loading" } | { status: "error" };
const state = vi.hoisted(() => ({ urls: [] as string[], answer: (_url: string): State => ({ status: "loading" }), retry: vi.fn() }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: (url: string) => { state.urls.push(url); return { state: state.answer(url), retry: state.retry }; } }));
vi.mock("@/components/banner-slot/banner-slot", () => ({ BannerSlot: ({ slot }: { slot: string }) => <div data-testid="banner" data-slot={slot} /> }));

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id, celebritySlug: "elina", body: `${id} 제목\n본문`, visibility: "public", revision: 1, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" },
  assets: [], video: null, createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z", isOwner: false, likeCount: 3, liked: false, commentCount: 1, ...extra,
});
beforeEach(() => { state.urls = []; state.retry.mockReset(); });
afterEach(cleanup);

it("reads the week ranking of the same page, leaves out the post being read and shows five rows with likes and comments", () => {
  state.answer = () => ({ status: "ready", data: ["a", "current", "b", "c", "d", "e", "f"].map(id => post(id)) });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(state.urls[0]).toBe("/api/celebrities/elina/popular-posts?period=week&locale=ko");
  const rows = screen.getAllByRole("link");
  expect(rows).toHaveLength(MORE_ROWS);
  expect(rows.map(row => row.textContent)).toEqual(["a", "b", "c", "d", "e"].map(id => `${id} 제목좋아요 3댓글 1`));
  expect(rows[0].getAttribute("href")).toMatch(/^\/c\/elina\/community\/a\?locale=ko&returnTo=%2Felina%3Ftab%3Dboard/);
  expect(screen.getByTestId("banner").dataset.slot).toBe("fanpage_second");
});

it("switches to the latest fan posts of the page", () => {
  state.answer = () => ({ status: "ready", data: [post("a")] });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "최신" }));
  expect(state.urls.at(-1)).toBe("/api/celebrities/elina/feed?locale=ko&source=fans&limit=12");
  expect(screen.getByRole("button", { name: "최신" }).getAttribute("aria-pressed")).toBe("true");
});

it("keeps the block height with empty rows, not loading bars, when the page has few other posts", () => {
  state.answer = () => ({ status: "ready", data: [post("a"), post("current")] });
  const { container } = render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(screen.getAllByRole("link")).toHaveLength(1);
  const empty = container.querySelectorAll("li[aria-hidden=true]");
  expect(empty).toHaveLength(MORE_ROWS - 1);
  for (const row of empty) expect(row.childElementCount).toBe(0);
});

it("leaves a zero count out, and the whole count line when both are zero", () => {
  state.answer = () => ({ status: "ready", data: [post("a", { likeCount: 2, commentCount: 0 }), post("b", { likeCount: 0, commentCount: 0 })] });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(screen.getAllByRole("link").map(row => row.textContent)).toEqual(["a 제목좋아요 2", "b 제목"]);
});

it("folds the list when the page has no other post, but keeps the banner place", () => {
  state.answer = () => ({ status: "ready", data: [post("current")] });
  render(<PostDetailMore slug="elina" postId="current" locale="ko" />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.getByTestId("banner")).toBeTruthy();
});

it("offers a retry when the list cannot be read, and no banner on a brand page", () => {
  state.answer = () => ({ status: "error" });
  render(<PostDetailMore slug="brand" postId="current" locale="ko" banner={false} />);
  fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "다시 시도" }));
  expect(state.retry).toHaveBeenCalled();
  expect(screen.queryByTestId("banner")).toBeNull();
});

it("shows a public post's first photo and the page image otherwise", () => {
  state.answer = () => ({ status: "ready", data: [post("photo", { assets: [{ id: "bba239f6-6c6b-4a36-87bf-b325dfe5d4ca", width: 640, height: 480 }] }), post("members", { visibility: "members", assets: [{ id: "bba239f6-6c6b-4a36-87bf-b325dfe5d4cb", width: 640, height: 480 }] })] });
  const { container } = render(<PostDetailMore slug="elina" postId="current" locale="ko" pageImage={<i data-testid="page" />} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/content-assets/bba239f6-6c6b-4a36-87bf-b325dfe5d4ca?size=thumbnail");
  expect(screen.getAllByTestId("page")).toHaveLength(1);
});

it("reads both answers into fan posts: the ranking as it is, the feed without its other kinds", () => {
  const id = "22222222-2222-4222-8222-222222222222", noticeId = "33333333-3333-4333-8333-333333333333";
  const fanPost = post(id);
  expect(parseMore({ items: [fanPost] }).map(item => item.id)).toEqual([id]);
  const notice = { kind: "notice", noticeKind: "standard", commentCount: 0, id: noticeId };
  const feed = { items: [{ ...fanPost, kind: "fan_post" }], nextCursor: null, unavailableSources: [] };
  expect(parseMore(feed).map(item => item.id)).toEqual([id]);
  expect(() => parseMore({ ...feed, items: [...feed.items, notice] })).toThrow();
  expect(moreTitle({ body: "첫 줄\n둘째 줄" })).toBe("첫 줄");
});
