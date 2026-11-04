import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FanPostDetail } from "./fan-post-detail";
import { FanPostFeed } from "./fan-post-feed";

const state = vi.hoisted(() => ({
  authenticated: true,
  getAccessToken: vi.fn(async()=>"token"),
  policyReads: [] as string[],
  urls: [] as string[],
  replace: vi.fn(),
  request: vi.fn(),
  retry: vi.fn(),
  replyReads: [] as string[],
  feedError: "",
  unavailableSources: [] as string[],
  returnTo: null as string | null,
  post: {} as Record<string, unknown>,
  comments: [] as Record<string, unknown>[],
  commentPages: {} as Record<string, { items: Record<string, unknown>[]; nextCursor: string | null }>,
  pages: {} as Record<string, { items: Record<string, unknown>[]; nextCursor: string | null }>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }), useSearchParams: () => new URLSearchParams(state.returnTo ? { returnTo: state.returnTo } : {}) }));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: state.authenticated, user: { id: "viewer" }, getAccessToken: state.getAccessToken }),
}));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({
  useContentMutation: () => ({ request: state.request, busy: false, error: "" }),
}));
vi.mock("@/features/content-safety/ui/content-actions", () => ({
  ContentActions: () => null,
  ContentTranslation: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({
  useCommunityResource: (url: string) => {
    state.urls.push(url);
    if (url.includes("/replies?")) { state.replyReads.push(url); return { state: { status: "ready", data: { replies: [], total: 0, nextCursor: null } }, retry: state.retry }; }
    if (url.includes("/comments?")) {
      const cursor = new URL(url, "https://example.test").searchParams.get("cursor") ?? "first";
      return { state: { status: "ready", data: state.commentPages[cursor] ?? { items: state.comments, nextCursor: null } }, retry: vi.fn() };
    }
    if (url.startsWith("/api/posts/")) return { state: { status: "ready", data: state.post }, retry: vi.fn() };
    const cursor = new URL(url, "https://example.test").searchParams.get("cursor") ?? "first";
    return { state: state.feedError ? { status: "error", code: state.feedError } : { status: "ready", data: { ...state.pages[cursor], unavailableSources: state.unavailableSources } }, retry: state.retry };
  },
}));

const post = (body: string, isOwner = false) => ({
  kind: "fan_post",
  id: "10000000-0000-4000-8000-000000000001",
  celebritySlug: "artist",
  body,
  visibility: "public",
  revision: 1,
  author: { nickname: "Writer", avatarUrl: "/images/avatars/star-pink.webp" },
  assets: [],
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
  isOwner,
  likeCount: 0,
  liked: false,
  commentCount: 0,
});

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  Element.prototype.scrollIntoView = vi.fn();
  state.authenticated = true;
  state.policyReads=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
    if(['/api/celebrities/artist/attachment-policy','/api/celebrities/brand/attachment-policy'].includes(url)&&(!init?.method||init.method==='GET')){
      state.policyReads.push(url);expect(init?.headers).toMatchObject({Authorization:'Bearer token'});
      return Response.json({photoLimit:4,videoAllowed:false});
    }
    throw new Error(`Unexpected test request: ${url}`);
  }));
  state.urls = [];
  state.replace.mockReset();
  state.request.mockReset().mockResolvedValue({ ok: true });
  state.retry.mockReset(); state.feedError = ""; state.unavailableSources = [];
  state.returnTo = null;
  state.post = post("Post body");
  state.comments = []; state.replyReads = [];
  state.commentPages = {};
  state.pages = {};
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("fan post UI navigation and context", () => {
  it("combines official, fan and legacy cheer posts with one composer and preserves each action target", () => {
    const returnTo = "/artist?tab=board&locale=en#celebrity-content";
    state.pages = { first: { items: [
      { kind: "notice", noticeKind: "standard", id: "20000000-0000-4000-8000-000000000001", slug: "artist-update", title: "A note from the artist", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "See you at the next show." }] }] }, postType: "artist_post", publishedAt: "2026-10-09T01:00:00Z", visibility: "public", revision: 1, pinned: false, commentCount: 3 },
      post("A fan’s story"),
      { kind: "cheer", id: "30000000-0000-4000-8000-000000000001", nickname: "Early fan", avatarUrl: "/images/avatars/star-pink.webp", body: "An older cheer remains here.", createdAt: "2026-09-20T01:00:00Z", clapCount: 0, viewerClapped: false, replyCount: 0, isOwner: false },
    ], nextCursor: null } };
    render(<FanPostFeed slug="artist" creatorName="Artist" locale="en" source="all" returnTo={returnTo} />);
    expect(screen.getByText("See you at the next show.")).toBeInTheDocument();
    expect(screen.getByText("A fan’s story")).toBeInTheDocument();
    expect(screen.getByText("An older cheer remains here.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Write a post" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Like/ })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Comments 3" })).toHaveAttribute("href", `/c/artist/notices/artist-update?locale=en&returnTo=${encodeURIComponent(returnTo)}#comments`);
    expect(screen.getByRole("link", { name: "Fan posts" })).toHaveAttribute("href", "/artist?tab=board&source=fans&locale=en#celebrity-content");
  });

  it("restores actions on older pages, keeps failed reply drafts and reuses their retry key", async () => {
    const cheerId = "30000000-0000-4000-8000-000000000001";
    state.pages = { first: { items: [post("New post")], nextCursor: "old" }, old: { items: [{ kind: "cheer", id: cheerId, nickname: "Early fan", avatarUrl: "/images/avatars/star-pink.webp", body: "Old cheer", createdAt: "2026-09-20T01:00:00Z", clapCount: 2, viewerClapped: false, replyCount: 0, isOwner: false }], nextCursor: null } };
    render(<FanPostFeed slug="artist" locale="en" source="fans" />);
    fireEvent.click(screen.getByRole("button", { name: "Older posts" }));
    expect(state.replyReads).toHaveLength(0);
    state.request.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Like 2" }));
    await waitFor(() => expect(state.request).toHaveBeenCalledWith(`/api/cheers/${cheerId}/clap`, "PUT", { selected: true }));
    expect(screen.getByRole("button", { name: "Like 2" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Like 2" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Like 3" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Comments 0" }));
    expect(state.replyReads[0]).toBe(`/api/cheers/${cheerId}/replies?locale=en`);
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "Keep this reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Comments 0" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Comments 0" }));
    expect(screen.getByRole("textbox")).toHaveValue("Keep this reply");
    state.request.mockClear().mockResolvedValueOnce(null);
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(state.request).toHaveBeenCalledOnce());
    const payload = state.request.mock.calls[0][2];
    expect(payload).toEqual({ body: "Keep this reply", replyToId: cheerId, idempotencyKey: expect.any(String) });
    expect(field).toHaveValue("Keep this reply");
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(field).toHaveValue(""));
    expect(state.request).toHaveBeenLastCalledWith("/api/celebrities/artist/cheers?locale=en", "POST", payload);
  });

  it("uses brand official copy and keeps new brand posts public", async () => {
    state.pages = { first: { items: [
      { kind: "notice", noticeKind: "standard", id: "20000000-0000-4000-8000-000000000002", slug: "brand-update", title: "Brand note", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Brand news" }] }] }, postType: "artist_post", publishedAt: "2026-10-09T01:00:00Z", visibility: "public", revision: 1, pinned: false, commentCount: 0 },
    ], nextCursor: null } };
    render(<FanPostFeed slug="brand" creatorName="Brand" locale="en" source="all" officialPostLabel="Brand updates" allowMembers={false} />);

    expect(screen.getByText("Brand updates")).toBeInTheDocument();
    expect(screen.queryByText("Artist update")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
    expect(screen.queryByRole("button", { name: /Visibility/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Write a post" }), { target: { value: "Public brand conversation" } });
    await waitFor(()=>expect(screen.getByRole("button",{name:"Publish"})).toBeEnabled());
    expect(state.policyReads).toContain("/api/celebrities/brand/attachment-policy");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(state.request).toHaveBeenCalledWith(
      "/api/celebrities/brand/posts",
      "POST",
      expect.objectContaining({ body: "Public brand conversation", visibility: "public" }),
    ));
  });

  it("does not present a fan composer in the official filter and resets drafts on source changes", () => {
    state.pages = { first: { items: [], nextCursor: null } };
    const view = render(<FanPostFeed slug="artist" locale="en" source="all" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unpublished draft" } });
    view.rerender(<FanPostFeed slug="artist" locale="en" source="official" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write a post" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official" })).toHaveAttribute("aria-current", "page");
  });

  it("confirms deleting an old cheer through its existing API", async () => {
    state.pages = { first: { items: [{ kind: "cheer", id: "30000000-0000-4000-8000-000000000001", nickname: "Me", avatarUrl: "/images/avatars/star-pink.webp", body: "My old cheer", createdAt: "2026-09-20T01:00:00Z", clapCount: 0, viewerClapped: false, replyCount: 0, isOwner: true }], nextCursor: null } };
    render(<FanPostFeed slug="artist" locale="en" source="fans" />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(state.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.request).toHaveBeenCalledWith("/api/cheers/30000000-0000-4000-8000-000000000001", "DELETE"));
  });

  it("keeps source failures and unfinished scans distinct from an empty feed", () => {
    state.pages = { first: { items: [], nextCursor: "scan-more" } };
    const view = render(<FanPostFeed slug="artist" locale="en" source="all" />);
    expect(screen.queryByText("No posts yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Older posts" })).toBeInTheDocument();
    state.pages.first.nextCursor = null;
    state.unavailableSources = ["chzzk"];
    view.rerender(<FanPostFeed slug="artist" locale="en" source="all" />);
    expect(screen.getByText(/CHZZK updates couldn’t load/)).toBeInTheDocument();
    expect(screen.queryByText("No posts yet")).not.toBeInTheDocument();
    state.feedError = "FEED_CURSOR_EXPIRED";
    view.rerender(<FanPostFeed slug="artist" locale="en" source="all" />);
    expect(screen.getByRole("alert")).toHaveTextContent("The feed has changed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it("uses a quiet visibility dialog and returns focus before cancelling the composer", async () => {
    state.pages = { first: { items: [], nextCursor: null } };
    render(<FanPostFeed slug="artist" locale="en" />);

    expect(screen.queryByRole("textbox", { name: "Write a post" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
    expect(screen.getByRole("textbox", { name: "Write a post" })).toHaveFocus();
    const photoInput = screen.getByLabelText("Add photos") as HTMLInputElement;
    expect(photoInput).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Add photos" })).toHaveAccessibleDescription(/4/);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Add photos"})).toBeEnabled());
    expect(state.policyReads).toContain("/api/celebrities/artist/attachment-policy");
    const openPhotoChooser = vi.spyOn(photoInput, "click");
    fireEvent.click(screen.getByRole("button", { name: "Add photos" }));
    expect(openPhotoChooser).toHaveBeenCalledOnce();
    const visibility = screen.getByRole("button", { name: "Visibility: Public" });
    visibility.focus();
    fireEvent.click(visibility);
    expect(await screen.findByRole("dialog", { name: "Visibility" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(visibility).toHaveFocus());
    fireEvent.click(visibility);
    fireEvent.click(await screen.findByRole("radio", { name: "Passport members" }));
    expect(screen.queryByRole("dialog", { name: "Visibility" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visibility: Passport members" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog",{name:"Stop writing?"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Discard draft"}));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No posts yet");
  });

  it("uses the shared bottom-sheet variant on mobile", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    state.pages = { first: { items: [], nextCursor: null } };
    render(<FanPostFeed slug="artist" locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
    fireEvent.click(screen.getByRole("button", { name: "Visibility: Public" }));
    expect(await screen.findByRole("dialog", { name: "Visibility" })).toHaveAttribute("data-variant", "bottom-sheet");
  });

  it("preserves member-only visibility while editing", async () => {
    const memberPost = { ...post("Members only", true), visibility: "members" };
    state.pages = { first: { items: [memberPost], nextCursor: null } };
    render(<FanPostFeed slug="artist" locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Visibility: Passport members" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit" }), { target: { value: "Updated" } });
    await waitFor(()=>expect(screen.getByRole("button",{name:"Save"})).toBeEnabled());
    expect(state.policyReads).toContain("/api/celebrities/artist/attachment-policy");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.request).toHaveBeenCalledWith(
      `/api/posts/${memberPost.id}`,
      "PATCH",
      expect.objectContaining({ body: "Updated", visibility: "members" }),
    ));
  });

  it("plays the point burst after a new post only when the response carries reward points", async () => {
    state.pages = { first: { items: [], nextCursor: null } };
    for (const [response, shown] of [[{ id: "p", reward: { points: 30 } }, true], [{ id: "p" }, false]] as const) {
      cleanup(); state.request.mockReset().mockResolvedValue(response);
      render(<FanPostFeed slug="artist" locale="en" />);
      fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Write a post" }), { target: { value: "hello" } });
      await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
      await waitFor(() => expect(state.request).toHaveBeenCalled());
      await waitFor(() => expect(document.querySelector("[data-testid=point-reward-burst]") !== null).toBe(shown));
    }
  });

  it("plays the point burst after a comment only when the response carries reward points", async () => {
    state.post = post("Commented post");
    for (const [response, shown] of [[{ id: "c", reward: { points: 5 } }, true], [{ id: "c" }, false]] as const) {
      cleanup(); state.request.mockReset().mockResolvedValue(response);
      render(<FanPostDetail postId={state.post.id as string} locale="en" />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "nice" } });
      fireEvent.submit(document.querySelector("form")!);
      await waitFor(() => expect(state.request).toHaveBeenCalledWith(expect.stringContaining("/comments"), "POST", expect.anything()));
      await waitFor(() => expect(document.querySelector("[data-testid=point-reward-burst]") !== null).toBe(shown));
    }
  });

  it("preserves the creator-local return path through details and deletion", async () => {
    state.post = post("Owned post", true);
    state.returnTo = "/artist?tab=community&locale=en#celebrity-content";
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<FanPostDetail postId={state.post.id as string} locale="en" />);

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", state.returnTo);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Delete"}));
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith(state.returnTo));
  });

  it("shows a filled active heart immediately and rolls it back when the API fails", async () => {
    let finish: (value: null) => void = () => undefined;
    state.request.mockReturnValue(new Promise<null>(resolve => { finish = resolve; }));
    state.pages = { first: { items: [post("Like me")], nextCursor: null } };
    render(<FanPostFeed slug="artist" locale="en" />);

    const like = screen.getByRole("button", { name: "Like 0" });
    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(like).toHaveTextContent("Like 1");
    expect(like.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    finish(null);
    await waitFor(() => expect(like).toHaveAttribute("aria-pressed", "false"));
    expect(like).toHaveTextContent("Like 0");
  });

  it("returns to the community after deleting the detailed post", async () => {
    state.post = post("Owned post", true);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<FanPostDetail postId={state.post.id as string} locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Delete"}));

    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/community?creator=artist&tab=posts&locale=en"));
    expect(state.request).toHaveBeenCalledWith(`/api/posts/${state.post.id}`, "DELETE");
  });

  it("describes the reply target and restores focus when reply is cancelled", async () => {
    state.comments = [{
      id: "20000000-0000-4000-8000-000000000002",
      postId: state.post.id,
      parentId: null,
      body: "A comment that identifies the exact reply target",
      revision: 1,
      author: { nickname: "Alex", avatarUrl: "/images/avatars/heart-pink.webp" },
      createdAt: "2026-09-26T01:00:00Z",
      isOwner: false,
    }];
    render(<FanPostDetail postId={state.post.id as string} locale="en" />);
    const reply = screen.getByRole("button", { name: "Reply" });

    fireEvent.click(reply);

    const textarea = screen.getByRole("textbox", { name: "Reply" });
    expect(textarea.closest("li")).toHaveAttribute("id", `comment-${state.comments[0].id}`);
    expect(textarea).toHaveFocus();
    const description = document.getElementById(textarea.getAttribute("aria-describedby")!);
    expect(description).toHaveTextContent("Alex");
    expect(description).toHaveTextContent("A comment that identifies the exact reply target");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(reply).toHaveFocus());
  });

  it("preserves separate comment and reply drafts and retries the same reply after failure", async () => {
    state.comments = ["Alex", "Sam"].map((nickname, index) => ({
      id: `comment-${index}`, postId: state.post.id, parentId: null, body: `${nickname}'s comment`, revision: 1,
      author: { nickname, avatarUrl: "/images/avatars/heart-pink.webp" }, createdAt: "2026-09-26T01:00:00Z", isOwner: false,
    }));
    render(<FanPostDetail postId={state.post.id as string} locale="en" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Write a comment" }), { target: { value: "My top-level draft" } });
    const alex = within(document.getElementById("comment-comment-0")!);
    const sam = within(document.getElementById("comment-comment-1")!);
    fireEvent.click(alex.getByRole("button", { name: "Reply" }));
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    fireEvent.change(alex.getByRole("textbox", { name: "Reply" }), { target: { value: "Reply to Alex" } });
    fireEvent.click(sam.getByRole("button", { name: "Reply" }));
    expect(sam.getByRole("textbox", { name: "Reply" })).toHaveValue("");
    fireEvent.change(sam.getByRole("textbox", { name: "Reply" }), { target: { value: "Reply to Sam" } });
    fireEvent.click(alex.getByRole("button", { name: "Reply" }));
    expect(alex.getByRole("textbox", { name: "Reply" })).toHaveValue("Reply to Alex");
    state.request.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    const first = state.request.mock.calls[0][2];
    expect(first).toMatchObject({ body: "Reply to Alex", parentId: "comment-0" });
    expect(alex.getByRole("textbox", { name: "Reply" })).toHaveValue("Reply to Alex");
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveValue("My top-level draft"));
    expect(state.request.mock.calls[1][2]).toEqual(first);
    fireEvent.click(sam.getByRole("button", { name: "Reply" }));
    expect(sam.getByRole("textbox", { name: "Reply" })).toHaveValue("Reply to Sam");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveValue("My top-level draft");
    fireEvent.click(alex.getByRole("button", { name: "Reply" }));
    expect(alex.getByRole("textbox", { name: "Reply" })).toHaveValue("");
  });

  it("keeps the reply target visible while comments move to another page", () => {
    const comment = {
      id: "20000000-0000-4000-8000-000000000002",
      postId: state.post.id,
      parentId: null,
      body: "A comment that stays the reply target across pages",
      revision: 1,
      author: { nickname: "Alex", avatarUrl: "/images/avatars/heart-pink.webp" },
      createdAt: "2026-09-26T01:00:00Z",
      isOwner: false,
    };
    state.commentPages = {
      first: { items: [comment], nextCursor: "page-2" },
      "page-2": { items: [], nextCursor: null },
    };
    render(<FanPostDetail postId={state.post.id as string} locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText(/Writing a reply/)).toHaveTextContent("Alex");
    fireEvent.click(screen.getByRole("button", { name: "Older posts" }));

    expect(screen.getByText(/Writing a reply/)).toHaveTextContent("Alex");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("returns from the third feed page to the immediately newer page", () => {
    state.authenticated = false;
    state.pages = {
      first: { items: [post("Page one")], nextCursor: "page-2" },
      "page-2": { items: [post("Page two")], nextCursor: "page-3" },
      "page-3": { items: [post("Page three")], nextCursor: null },
    };
    render(<FanPostFeed slug="artist" locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Older posts" }));
    expect(screen.getByText("Page two")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Older posts" }));
    expect(screen.getByText("Page three")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Newer posts" }));
    expect(screen.getByText("Page two")).toBeInTheDocument();
  });
});


it("keeps Wave program post edits public", async () => {
  const programPost = { ...post("Program memory", true), celebritySlug: "kyaa-wave-fanpage" };
  state.pages = { first: { items: [programPost], nextCursor: null } };
  render(<FanPostFeed slug="kyaa-wave-fanpage" locale="en" program="wave-quiz" returnTo="/kyaa-wave-fanpage/programs/wave-quiz?locale=en" />);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(screen.queryByRole("button", { name: /Visibility/ })).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Updated program memory" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(state.request).toHaveBeenCalledWith(`/api/posts/${programPost.id}`, "PATCH", expect.objectContaining({ visibility: "public" })));
});

it("offers a private introduction with required text and an optional photo", async () => {
  state.pages = { first: { items: [{ ...post("Hello participants"), celebritySlug: "kyaa-wave-fanpage" }], nextCursor: null } };
  render(<FanPostFeed slug="kyaa-wave-fanpage" locale="ko" source="all" introduction />);
  expect(screen.getByText("간단한 자기소개를 남겨주세요. 본인 사진은 선택으로 첨부할 수 있어요.")).toBeInTheDocument();
  expect(screen.getByText("Private")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "전체" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "자기소개 쓰기" }));
  expect(screen.getByRole("textbox", { name: "간단한 자기소개" })).toBeRequired();
  expect(screen.queryByRole("button", { name: /공개/ })).toBeNull();
  expect(screen.getByRole("button", { name: "본인 사진 (선택)" })).toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "게시" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "음악과 영상을 만드는 민지입니다." } });
  fireEvent.click(submit);
  await waitFor(() => expect(state.request).toHaveBeenCalledWith("/api/celebrities/kyaa-wave-fanpage/posts", "POST", expect.objectContaining({ body: "음악과 영상을 만드는 민지입니다.", assetIds: [] })));
});

it("preserves media-only community context through post details and guest login", () => {
  state.authenticated = false;
  state.returnTo = "/community?creator=artist&tab=posts&locale=en&media=1";
  render(<FanPostDetail postId={String(state.post.id)} locale="en" />);
  expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", state.returnTo);
  const login = screen.getAllByRole("link").find(link => link.getAttribute("href")?.startsWith("/login?"));
  expect(login).toBeDefined();
  const detailUrl = new URL(new URL(login!.getAttribute("href")!, "https://example.test").searchParams.get("returnTo")!, "https://example.test");
  expect(detailUrl.searchParams.get("returnTo")).toBe(state.returnTo);
});


it("uses compact numbered pages, a five-row mobile request, and the existing body contract for a titled post", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  state.pages = { first: { items: [post("First story")], nextCursor: "page-two" }, "page-two": { items: [post("Second story")], nextCursor: null } };
  render(<FanPostFeed compact slug="artist" locale="en" source="fans" intro="" />);
  expect(state.urls.some(url => url.includes("limit=5"))).toBe(true);
  expect(screen.getByRole("button", {name:"1"})).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", {name:"2"}));
  expect(screen.getByText("Second story")).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"2"})).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", {name:"Write a post"}));
  expect(screen.queryByText("Second story")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", {name:"Title"}), {target:{value:"Original title"}});
  fireEvent.change(screen.getByRole("textbox", {name:"Body"}), {target:{value:"Original body"}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"Publish"})).toBeEnabled());
  expect(state.policyReads).toContain("/api/celebrities/artist/attachment-policy");
  fireEvent.click(screen.getByRole("button", {name:"Publish"}));
  await waitFor(() => expect(state.request).toHaveBeenCalledWith("/api/celebrities/artist/posts", "POST", expect.objectContaining({body:"Original title\nOriginal body"})));
});

it("uses the existing first line as the board detail heading without repeating it in the article", () => {
  state.post = post("Original title\nOriginal body");
  render(<FanPostDetail postId={String(state.post.id)} locale="en" presentation="board" />);
  expect(screen.getByRole("heading", {level:1})).toHaveTextContent("Original title");
  expect(screen.getAllByText("Original title")).toHaveLength(1);
  expect(screen.getByText("Original body")).toBeInTheDocument();
});
it('requires a read after an uncertain delete instead of deleting again',async()=>{
 state.post=post('Owned post',true);state.request.mockImplementation(async(_url:string,method:string)=>method==='DELETE'?null:{post:state.post});
 render(<FanPostDetail postId={String(state.post.id)} locale='en'/>);fireEvent.click(screen.getByRole('button',{name:'More'}));fireEvent.click(screen.getByRole('menuitem',{name:'Delete'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete'}));await waitFor(()=>expect(screen.getByRole('dialog')).toHaveAttribute('data-source-node','jU13c'));
 expect(state.request.mock.calls.filter(call=>call[1]==='DELETE')).toHaveLength(1);fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Check post status'}));await waitFor(()=>expect(state.request).toHaveBeenCalledWith(`/api/posts/${state.post.id}?locale=en`,'GET'));expect(state.request.mock.calls.filter(call=>call[1]==='DELETE')).toHaveLength(1);
});
