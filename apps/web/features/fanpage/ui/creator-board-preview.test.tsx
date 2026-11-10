import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { boardPreviewTime, CreatorBoardPreview } from "./creator-board-preview";

const state = vi.hoisted(() => ({ url: "", value: { status: "loading" } as unknown, retry: vi.fn() }));
vi.mock("./use-community-resource", () => ({ useCommunityResource: (url: string) => { state.url = url; return { state: state.value, retry: state.retry }; } }));

const post = (id: string, body: string, commentCount = 0) => ({ kind: "fan_post", id, celebritySlug: "ifewknow", body, visibility: "public", revision: 1, author: { nickname: `팬${id}`, avatarUrl: null }, assets: [], video: null, createdAt: "2026-11-09T03:00:00Z", updatedAt: "2026-11-09T03:00:00Z", isOwner: false, likeCount: 0, liked: false, commentCount });
beforeEach(() => { state.value = { status: "loading" }; });
afterEach(cleanup);

it("reads the latest five fan posts and shows them as one-line rows under 글쓰기 and 전체 보기", () => {
  state.value = { status: "ready", data: { items: [post("1", "첫 줄 제목\n둘째 줄", 3), ...["2", "3", "4", "5", "6"].map(id => post(id, `글 ${id}`))], nextCursor: null, unavailableSources: [] } };
  const { container } = render(<CreatorBoardPreview slug="ifewknow" locale="ko" />);
  expect(state.url).toBe("/api/celebrities/ifewknow/feed?locale=ko&source=fans&limit=5");
  expect(screen.getByRole("heading", { level: 2, name: "팬게시판" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "글쓰기" })).toHaveAttribute("href", "/ifewknow?tab=board&source=fans&locale=ko&compose=1#celebrity-content");
  expect(screen.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/ifewknow?tab=board&source=fans&locale=ko#celebrity-content");
  const rows = container.querySelectorAll("li");
  expect(rows).toHaveLength(5);
  const first = within(rows[0] as HTMLElement);
  expect(first.getByRole("link", { name: "첫 줄 제목" })).toHaveAttribute("href", expect.stringContaining("/c/ifewknow/community/1?locale=ko&returnTo="));
  expect(first.getByLabelText("댓글 3")).toHaveTextContent("[3]");
  expect(rows[0]).toHaveTextContent("팬1");
  expect(container).not.toHaveTextContent("팬들과 감상과 응원을 나눠 보세요.");
});

it("keeps the same card with a single 글쓰기 action when the board is empty", () => {
  state.value = { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } };
  const { container } = render(<CreatorBoardPreview slug="ifewknow" locale="ko" />);
  expect(container.querySelectorAll("li")).toHaveLength(0);
  expect(screen.getAllByRole("link", { name: "글쓰기" })).toHaveLength(1);
  expect(container.querySelector("[data-creator-board-preview] > div:last-child")).toContainElement(screen.getByRole("link", { name: "글쓰기" }));
});

it("keeps a failed read recoverable instead of showing an empty board", () => {
  state.value = { status: "error" };
  render(<CreatorBoardPreview slug="ifewknow" locale="en" />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Write a post" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View all" })).toBeInTheDocument();
});

it("labels today's posts by KST time and older ones by date", () => {
  const now = new Date("2026-11-10T05:00:00Z");
  expect(boardPreviewTime("2026-11-10T01:05:00Z", now)).toBe("10:05");
  expect(boardPreviewTime("2026-11-09T03:00:00Z", now)).toBe("11. 09.");
});
