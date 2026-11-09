import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { editorSource } from "@/components/editor/editor-source";
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
vi.mock("@/components/editor/lazy-rich-editor", () => ({ LazyRichEditor: ({ value, onChange }: { value: unknown; onChange: (next: unknown) => void }) => <div data-testid="rich-editor">{JSON.stringify(value)}<button type="button" onClick={() => onChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "가".repeat(120_000) }] }] })}>oversize</button><button type="button" onClick={() => onChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "새 본문" }] }] })}>type</button></div> }));

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

it("M1: a board post whose document failed to read does not open the editor and says why", async () => {
  state.request.mockResolvedValue({ post: { ...post, bodyDocUnavailable: true } });
  render(<PostCard presentation="board" detail post={{ ...post, bodyDocUnavailable: true }} locale="en" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(editorSource.bodyDocUnavailable.en);
  expect(screen.queryByTestId("rich-editor")).toBeNull();
  expect(document.querySelector("textarea")).toBeNull();
});

it("M1: opens the editor with the document once the read works again", async () => {
  state.request.mockResolvedValue({ post: { ...post, bodyDoc } });
  render(<PostCard presentation="board" detail post={{ ...post, bodyDocUnavailable: true }} locale="en" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(await screen.findByTestId("rich-editor")).toHaveTextContent('"bold"');
});

it("M1: a feed card does not fall back to plain editing when the document failed to read", async () => {
  state.request.mockResolvedValue({ post: { ...post, bodyDocUnavailable: true } });
  render(<PostCard post={post} locale="en" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(editorSource.bodyDocUnavailable.en);
  expect(document.querySelector("textarea")).toBeNull();
});

it("M2: sends the title with the document and leaves the body to the server, and says when the document is too large", async () => {
  state.request.mockResolvedValueOnce({ post: { ...post, bodyDoc } });
  render(<PostCard post={post} locale="en" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByTestId("rich-editor");
  fireEvent.click(screen.getByRole("button", { name: "oversize" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(editorSource.documentTooLarge.en);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "type" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  expect(screen.queryByRole("alert")).toBeNull();
  state.request.mockResolvedValue({ id: post.id, revision: 4 });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(state.request).toHaveBeenCalledWith(`/api/posts/${post.id}`, "PATCH", expect.objectContaining({ body: "제목", bodyDoc: expect.anything() })));
});
