import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FanPostFeed } from "./fan-post-feed";
import { useGroupBoardNotices } from "@/features/groups/ui/group-board-notices";

const pageId = "f1630000-0000-4000-8000-000000000001";
const postId = "f1640000-0000-4000-8000-000000000009";
const notice = { id: postId, pageId, title: "운영자 공지 제목", body: "본문", visibility: "public", anonymous: false, profileId: null, nickname: "운영자", avatarUrl: null, createdAt: "2026-11-05T01:00:00.000Z" };
const resource = vi.hoisted(() => ({ state: { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } } as { status: string; data?: unknown; code?: string }, retry: vi.fn(), refreshFailed: false }));
const feedFixture = vi.hoisted(() => ({ read: undefined as undefined | ((url: string | null) => unknown) }));
const groupResource = vi.hoisted(() => ({ value: { data: undefined, error: false, loading: true } as { data?: unknown; error: boolean; loading: boolean }, url: undefined as string | null | undefined }));
// B6: which author names open a profile is asked separately; these tests are about the rows.
vi.mock("@/features/group-social/profile-window", () => ({ ProfileAuthor: ({ children }: { children: unknown }) => children }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: (url: string | null) => feedFixture.read?.(url) ?? resource }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupResource: (url: string | null) => { groupResource.url = url; return groupResource.value; } }));
beforeEach(() => { resource.state = { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } }; groupResource.value = { data: undefined, error: false, loading: true }; });
afterEach(() => { feedFixture.read = undefined; cleanup(); });

const notices = (items: unknown[], all = true) => { groupResource.value = { data: { items, nextCursor: null }, error: false, loading: false }; return renderHook(() => useGroupBoardNotices(pageId, "ko", { all })).result.current.items; };

it("reads active notices of the page from the existing posts API and links each to its detail", () => {
  const rows = notices([{ ...notice, commentCount: 0, viewCount: 19, likeCount: 4 }]);
  expect(groupResource.url).toBe(`/api/groups/${pageId}/posts?category=notice&sort=recent&limit=3`);
  expect(rows).toEqual([expect.objectContaining({ id: postId, commentCount: 0, viewCount: 19, likeCount: 4, title: "운영자 공지 제목", author: "운영자", href: `/pages/groups/${pageId}?locale=ko&tab=board&post=${postId}` })]);
});

it("returns nothing while loading, when empty, on failure and without a page id", () => {
  expect(renderHook(() => useGroupBoardNotices(pageId, "ko")).result.current).toEqual({ items: [], pending: true });
  expect(notices([])).toEqual([]);
  groupResource.value = { data: undefined, error: true, loading: false };
  expect(renderHook(() => useGroupBoardNotices(pageId, "ko")).result.current).toEqual({ items: [], pending: false });
  renderHook(() => useGroupBoardNotices(undefined, "ko"));
  expect(groupResource.url).toBeNull();
});

it("lists pinned notices above the feed rows for the all and notice views, never for the fans view", () => {
  const pinned = notices([notice]);
  const view = render(<FanPostFeed slug="artist" locale="ko" source="all" compact pinnedNotices={pinned} />);
  const link = screen.getByRole("link", { name: /운영자 공지 제목/ });
  expect(link).toHaveAttribute("href", `/pages/groups/${pageId}?locale=ko&tab=board&post=${postId}`);
  expect(link.closest("li")?.textContent).toContain("공지");
  view.rerender(<FanPostFeed slug="artist" locale="ko" source="official" compact pinnedNotices={pinned} />);
  expect(screen.getByRole("link", { name: /운영자 공지 제목/ })).toBeInTheDocument();
  view.rerender(<FanPostFeed slug="artist" locale="ko" source="fans" compact pinnedNotices={pinned} />);
  expect(screen.queryByRole("link", { name: /운영자 공지 제목/ })).not.toBeInTheDocument();
});

it("keeps the feed unchanged when there are no pinned notices", () => {
  const view = render(<FanPostFeed slug="artist" locale="ko" source="all" compact pinnedNotices={[]} />);
  const without = view.container.innerHTML;
  view.rerender(<FanPostFeed slug="artist" locale="ko" source="all" compact />);
  expect(view.container.innerHTML).toBe(without);
  expect(screen.queryByRole("link", { name: /운영자 공지 제목/ })).not.toBeInTheDocument();
});

it("omits the limit for the notice filter so the API default applies", () => {
  notices([notice], false);
  expect(groupResource.url).toBe(`/api/groups/${pageId}/posts?category=notice&sort=recent`);
});

it("keeps the feed loading until the notices settle, then shows both at once", async () => {
  resource.state = { status: "ready", data: { items: [{ kind: "fan_post", id: "p1", body: "팬 글 제목", author: { nickname: "팬" }, createdAt: "2026-11-05T00:00:00.000Z", commentCount: 0, likeCount: 0 }], nextCursor: null, unavailableSources: [] } } as never;
  const pinned = notices([notice]);
  const view = render(<FanPostFeed slug="artist" locale="ko" source="all" compact pinnedNotices={[]} pinnedPending />);
  expect(screen.getByRole("status", { busy: true })).toBeInTheDocument();
  expect(screen.queryByText(/팬 글 제목/)).not.toBeInTheDocument();
  view.rerender(<FanPostFeed slug="artist" locale="ko" source="all" compact pinnedNotices={pinned} pinnedPending={false} />);
  await waitFor(() => expect(screen.getByRole("link", { name: /운영자 공지 제목/ })).toBeInTheDocument());
  expect(screen.getByText(/팬 글 제목/)).toBeInTheDocument();
  view.rerender(<FanPostFeed slug="artist" locale="ko" source="all" compact pinnedNotices={[]} pinnedPending={false} />);
  expect(screen.getByText(/팬 글 제목/)).toBeInTheDocument();
});

it("does not hold the fans view and sends filter links through filterHref", () => {
  const view = render(<FanPostFeed slug="artist" locale="ko" source="fans" compact pinnedPending filterHref={value => `/pages/groups/${pageId}?tab=board&source=${value}` as never} />);
  expect(screen.queryByRole("status", { busy: true })).not.toBeInTheDocument();
  const links = Array.from(view.container.querySelectorAll("nav a")).map(link => link.getAttribute("href"));
  expect(links).toEqual(expect.arrayContaining([`/pages/groups/${pageId}?tab=board&source=official`, `/pages/groups/${pageId}?tab=board&source=all`]));
});

it("keeps the notice filter in the detail link so going back returns to it", () => {
  groupResource.value = { data: { items: [notice], nextCursor: null }, error: false, loading: false };
  const rows = renderHook(() => useGroupBoardNotices(pageId, "ko", { all: false, keepSource: true })).result.current.items;
  expect(rows[0].href).toBe(`/pages/groups/${pageId}?locale=ko&tab=board&source=official&post=${postId}`);
});

it.each([0, 1, 3, 5].flatMap(noticeCount => [0, 3, 20].map(fanCount => [noticeCount, fanCount])))(
  "groups %i notices with %i fan posts and continues from the exact fan cursor",
  (noticeCount, fanCount) => {
    const posts = Array.from({ length: fanCount }, (_, index) => ({
      kind: "fan_post", id: `fan-${index}`, body: `자유글 ${index + 1}`, author: { nickname: "팬" },
      createdAt: "2026-11-05T00:00:00Z", commentCount: 0, likeCount: 0,
    }));
    const groupCount = noticeCount === 5 ? 1 : 0;
    const officialNotices = Array.from({ length: noticeCount - groupCount }, (_, index) => ({
      kind: "notice", postType: "notice", id: `official-${index}`, slug: `official-${index}`,
      title: `공식 공지 ${index + 1}`, publishedAt: notice.createdAt, commentCount: 0,
    }));
    feedFixture.read = url => {
      if (!url) return resource;
      const params = new URL(url, "https://example.test").searchParams;
      const offset = Number(params.get("cursor"));
      const limit = Number(params.get("limit"));
      const items = params.get("source") === "fans" ? posts.slice(offset, offset + limit) : officialNotices.slice(0, limit);
      const nextCursor = offset + limit < fanCount && params.get("source") === "fans" ? String(offset + limit) : null;
      return { ...resource, state: { status: "ready", data: { items, nextCursor, unavailableSources: [] } } };
    };
    const pinned = Array.from({ length: groupCount }, (_, index) => ({
      id: `notice-${index}`, title: `공지 ${index + 1}`, href: "/notice", author: "운영자", date: notice.createdAt,
    }));
    const { container } = render(<FanPostFeed slug="artist" locale="ko" source="all" compact pinnedNotices={pinned} />);
    const rows = () => Array.from(container.querySelectorAll("ul > li"));
    const expectedNotices = Math.min(noticeCount, 3);
    const firstFanCount = Math.min(fanCount, 10 - expectedNotices);
    expect(rows().map(row => row.hasAttribute("data-notice"))).toEqual([
      ...Array(expectedNotices).fill(true), ...Array(firstFanCount).fill(false),
    ]);
    if (fanCount > firstFanCount) {
      fireEvent.click(screen.getByRole("button", { name: "2" }));
      expect(rows()).toHaveLength(10);
      expect(rows()[0]).toHaveTextContent(`자유글 ${firstFanCount + 1}`);
      expect(rows().some(row => row.hasAttribute("data-notice"))).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "1" }));
      expect(rows()).toHaveLength(10);
    }
  },
);
