import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FanPostFeed } from "./fan-post-feed";
import { FanPostDetail } from "./fan-post-detail";
import { NoticeDetail } from "@/components/notice/notice-detail";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";

vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: "viewer" }, getAccessToken: async () => "token" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "viewer", generation: 0 }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

const post = {
  kind: "fan_post", id: "10000000-0000-4000-8000-000000000001", celebritySlug: "artist", body: "A fan story", visibility: "public", revision: 1,
  author: { nickname: "Writer", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z", isOwner: true, likeCount: 0, liked: false, commentCount: 0,
};
let refresh: (() => Promise<Response>) | undefined;
let reads: number;
let writes: number;
beforeEach(() => {
  reads = 0; writes = 0; refresh = undefined;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/content-translations" || input === "/api/display-translations") return Response.json({ error: { code: "TRANSLATION_UNAVAILABLE" } }, { status: 503 });
    if (init?.method) { writes++; return Response.json({ ok: true }); }
    reads++;
    if (refresh) return refresh();
    if (input.includes("/comments?")) return Response.json({ items: [], nextCursor: null });
    if (input.startsWith("/api/posts/")) return Response.json({ post: Object.fromEntries(Object.entries(post).filter(([key]) => key !== "kind")) });
    return Response.json({ items: [post], nextCursor: null, unavailableSources: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps the post and selected heart mounted while a successful like refresh is pending", async () => {
  render(<FanPostFeed slug="artist" locale="en" />);
  const original = await screen.findByText("A fan story");
  refresh = () => new Promise(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Like 0" }));
  await waitFor(() => expect(reads).toBe(2));
  expect(writes).toBe(1);
  expect(original.isConnected).toBe(true);
  expect(screen.getByRole("button", { name: "Like 1" })).toHaveAttribute("aria-pressed", "true");
});

it("keeps an edit draft mounted on return to the window", async () => {
  render(<FanPostFeed slug="artist" locale="en" />);
  await screen.findByText("A fan story");
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  const draft = screen.getByRole("textbox", { name: "Edit" });
  fireEvent.change(draft, { target: { value: "Unsaved edit" } });
  refresh = () => new Promise(() => {});
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(reads).toBe(2));
  expect(draft.isConnected).toBe(true);
  expect(draft).toHaveValue("Unsaved edit");
});

it("keeps existing posts visible after publishing while the feed refresh is pending", async () => {
  render(<FanPostFeed slug="artist" locale="en" />);
  const original = await screen.findByText("A fan story");
  fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Write a post" }), { target: { value: "New story" } });
  refresh = () => new Promise(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(reads).toBe(2));
  expect(writes).toBe(1);
  expect(original.isConnected).toBe(true);
});

it("retains the detail and comment draft during a return-visit refresh", async () => {
  render(<FanPostDetail postId={post.id} locale="en" />);
  const original = await screen.findByText("A fan story");
  const draft = screen.getByRole("textbox", { name: "Write a comment" });
  fireEvent.change(draft, { target: { value: "Unsaved comment" } });
  refresh = () => new Promise(() => {});
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(reads).toBe(4));
  expect(original.isConnected).toBe(true);
  expect(draft.isConnected).toBe(true);
  expect(draft).toHaveValue("Unsaved comment");
});

it("keeps the feed on a transient refresh failure and offers a retry", async () => {
  render(<FanPostFeed slug="artist" locale="en" />);
  const original = await screen.findByText("A fan story");
  refresh = async () => Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
  fireEvent(window, new Event("focus"));
  expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(original.isConnected).toBe(true);
});

it("does not refresh community data for an unrelated passport-only update", async () => {
  render(<FanPostFeed slug="artist" locale="en" />);
  await screen.findByText("A fan story");
  await act(async () => notifyFanActivityUpdated("viewer", ["passports"]));
  expect(reads).toBe(1);
});

it("preserves the notice comment draft when returning to the window", async () => {
  const notice = { id: post.id, slug: "update", title: "Artist news", pinned: false, kind: "standard", postType: "notice", visibility: "public", revision: 1, publishedAt: post.createdAt, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "See you soon" }] }] } };
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    reads++;
    if (refresh) return refresh();
    return Response.json(input.includes("/comments?") ? { comments: [], nextCursor: null, total: 0 } : input.includes("limit=6") ? { notices: [], nextCursor: null } : notice);
  }));
  render(<NoticeDetail slug="artist" noticeSlug="update" locale="en" />);
  await screen.findByRole("heading", { name: "Artist news" });
  const draft = await screen.findByRole("textbox", { name: "Leave a comment" });
  fireEvent.change(draft, { target: { value: "Unsaved notice comment" } });
  refresh = () => new Promise(() => {});
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(reads).toBeGreaterThanOrEqual(5));
  expect(draft.isConnected).toBe(true);
  expect(draft).toHaveValue("Unsaved notice comment");
});
