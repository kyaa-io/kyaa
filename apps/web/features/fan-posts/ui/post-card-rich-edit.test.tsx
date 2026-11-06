import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";
import type { FanPost } from "../domain/content";

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "me" }, getAccessToken: async () => "t" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "me", generation: 1 }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: state.request }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: () => null }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: () => null }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => ({ ownerKey: "me", ready: true, request: vi.fn() }), useGroupResource: () => ({ data: { photoLimit: 10, videoAllowed: true }, failure: null, error: false, loading: false, retry: vi.fn() }) }));
vi.mock("@base-ui/react/menu", () => ({ Menu: { Root: ({ children }: { children: React.ReactNode }) => children, Trigger: () => null, Portal: ({ children }: { children: React.ReactNode }) => children, Positioner: ({ children }: { children: React.ReactNode }) => children, Popup: ({ children }: { children: React.ReactNode }) => children, Item: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button type="button" onClick={onClick}>{children}</button> } }));
vi.mock("@/components/editor/lazy-rich-editor", () => ({ LazyRichEditor: ({ value }: { value: unknown }) => <div data-testid="rich-editor">{JSON.stringify(value)}</div> }));

const bodyDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문", marks: [{ type: "bold" }] }] }] };
const post: FanPost = { id: "10000000-0000-4000-8000-000000000001", celebritySlug: "artist", body: "제목\n본문", visibility: "public", revision: 3, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", isOwner: true, likeCount: 0, commentCount: 0, liked: false };

beforeEach(() => { state.request.mockReset(); });

it("opens a rich post from a feed card in the editor that holds its document", async () => {
  state.request.mockResolvedValue({ post: { ...post, bodyDoc } });
  render(<PostCard post={post} locale="en" onChanged={vi.fn()} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const editor = await screen.findByTestId("rich-editor");
  expect(editor).toHaveTextContent('"bold"');
  expect(state.request).toHaveBeenCalledWith(expect.stringContaining(`/api/posts/${post.id}?`), "GET");
  expect(state.request.mock.calls[0]?.[0]).toContain("format=rich");
  expect(screen.queryByRole("textbox", { name: /edit/i })).toBeNull();
});

it("keeps the plain composer for a post without a document", async () => {
  state.request.mockResolvedValue({ post });
  render(<PostCard post={post} locale="en" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  expect(screen.queryByTestId("rich-editor")).toBeNull();
});

it("does not open an editor when the post could not be read", async () => {
  state.request.mockResolvedValue(null);
  render(<PostCard post={post} locale="en" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => expect(state.request).toHaveBeenCalled());
  expect(document.querySelector("textarea")).toBeNull();
  expect(screen.queryByTestId("rich-editor")).toBeNull();
});
