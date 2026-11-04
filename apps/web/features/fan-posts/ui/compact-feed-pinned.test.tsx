import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FanPostFeed } from "./fan-post-feed";
import { useGroupBoardNotices } from "@/features/groups/ui/group-board-notices";

const pageId = "f1630000-0000-4000-8000-000000000001";
const postId = "f1640000-0000-4000-8000-000000000009";
const notice = { id: postId, pageId, title: "운영자 공지 제목", body: "본문", visibility: "public", anonymous: false, profileId: null, nickname: "운영자", avatarUrl: null, createdAt: "2026-11-05T01:00:00.000Z" };
const resource = vi.hoisted(() => ({ state: { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } } as { status: string; data?: unknown; code?: string }, retry: vi.fn(), refreshFailed: false }));
const groupResource = vi.hoisted(() => ({ value: { data: undefined, error: false, loading: true } as { data?: unknown; error: boolean; loading: boolean }, url: undefined as string | null | undefined }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => resource }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupResource: (url: string | null) => { groupResource.url = url; return groupResource.value; } }));
beforeEach(() => { resource.state = { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } }; groupResource.value = { data: undefined, error: false, loading: true }; });
afterEach(cleanup);

const notices = (items: unknown[], all = true) => { groupResource.value = { data: { items, nextCursor: null }, error: false, loading: false }; return renderHook(() => useGroupBoardNotices(pageId, "ko", { all })).result.current.items; };

it("reads active notices of the page from the existing posts API and links each to its detail", () => {
  const rows = notices([notice]);
  expect(groupResource.url).toBe(`/api/groups/${pageId}/posts?category=notice&sort=recent&limit=5`);
  expect(rows).toEqual([expect.objectContaining({ id: postId, title: "운영자 공지 제목", author: "운영자", href: `/pages/groups/${pageId}?locale=ko&tab=board&post=${postId}` })]);
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
