import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";
import type { FanPost } from "../domain/content";
import { resetTranslationUnavailableForTest } from "@/features/content-safety/ui/use-automatic-translation";

const context = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "me" }, getAccessToken: async () => "token" },
  session: { ready: true, ownerId: "me", generation: 1 },
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => context.auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => context.session }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/content-actions", async importOriginal => ({ ...await importOriginal<typeof import("@/features/content-safety/ui/content-actions")>(), ContentActions: () => null }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: () => null }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: () => null }));
vi.mock("@base-ui/react/menu", () => ({ Menu: { Root: ({ children }: { children: React.ReactNode }) => children, Trigger: () => null, Portal: ({ children }: { children: React.ReactNode }) => children, Positioner: ({ children }: { children: React.ReactNode }) => children, Popup: ({ children }: { children: React.ReactNode }) => children, Item: () => null } }));

const id = "10000000-0000-4000-8000-000000000001";
const post: FanPost = { id, celebritySlug: "artist", body: "Concert tonight\nSee you all at the venue", visibility: "public", revision: 3, author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" },
  assets: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", isOwner: false, likeCount: 0, liked: false, commentCount: 0 };
const slotAnswer = (slots: Record<string, string>) => ({ targetType: "fan_post", targetId: id, targetLocale: "ko", sourceRevision: 3, cached: false, slots });
const view = (value: FanPost = post) => render(<PostCard presentation="board" detail post={value} locale="ko" onChanged={vi.fn()} />);
const requests = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) as Record<string, unknown> }));

// The hook memoizes requests per identity, locale, target and texts for the page; a new session generation keeps each case on its own.
beforeEach(() => { resetTranslationUnavailableForTest(); context.auth.authenticated = true; context.session.generation += 1; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("board post title translation", () => {
  it("C1 a signed-in reader gets title and article from one request, and the original switch restores both", async () => {
    const fetcher = vi.fn(async () => Response.json(slotAnswer({ title: "오늘 밤 콘서트", article: "공연장에서 만나요" })));
    vi.stubGlobal("fetch", fetcher);
    view();
    expect(await screen.findByRole("heading", { level: 1, name: "오늘 밤 콘서트" })).toHaveAttribute("lang", "ko");
    expect(screen.getByText("공연장에서 만나요")).toBeInTheDocument();
    expect(requests(fetcher)).toEqual([{ url: "/api/content-translations", body: { targetType: "fan_post", targetId: id, targetLocale: "ko", locale: "ko", slots: "title-body" } }]);
    fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("heading", { level: 1, name: "Concert tonight" })).toBeInTheDocument();
    expect(screen.getByText("See you all at the venue")).toBeInTheDocument();
    expect(screen.queryByText("오늘 밤 콘서트")).toBeNull(); expect(screen.queryByText("공연장에서 만나요")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("C2 a post with only a title is translated and switched back the same way", async () => {
    const fetcher = vi.fn(async () => Response.json(slotAnswer({ title: "오늘 밤 콘서트" })));
    vi.stubGlobal("fetch", fetcher);
    view({ ...post, body: "Concert tonight" });
    expect(await screen.findByRole("heading", { level: 1, name: "오늘 밤 콘서트" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("heading", { level: 1, name: "Concert tonight" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("C3 an answer that lacks a requested slot, or has an extra one, leaves the original", async () => {
    const answers: Array<Record<string, string>> = [{ title: "오늘 밤 콘서트" }, { article: "공연장에서 만나요" }, { title: "오늘 밤 콘서트", article: "공연장에서 만나요" }];
    for (const slots of answers) {
      context.session.generation += 1;
      const fetcher = vi.fn(async () => Response.json(slotAnswer(slots)));
      vi.stubGlobal("fetch", fetcher);
      const { unmount } = view(slots.article && slots.title ? { ...post, body: "Concert tonight" } : post);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concert tonight");
      expect(screen.queryByText("오늘 밤 콘서트")).toBeNull();
      unmount();
    }
  });
  it("C4 after a failed attempt the translate button retries and recovers", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: "TRANSLATION_FAILED" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(slotAnswer({ title: "오늘 밤 콘서트", article: "공연장에서 만나요" })));
    vi.stubGlobal("fetch", fetcher);
    view();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concert tonight");
    fireEvent.click(await screen.findByRole("button", { name: "번역 보기" }));
    expect(await screen.findByRole("heading", { level: 1, name: "오늘 밤 콘서트" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("C5 a guest keeps the title as written and translates the whole body through the display path only", async () => {
    context.auth.authenticated = false;
    const fetcher = vi.fn(async () => Response.json({ translatedText: "Concert tonight\n공연장에서 만나요" }));
    vi.stubGlobal("fetch", fetcher);
    view();
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(requests(fetcher)).toEqual([{ url: "/api/display-translations", body: { text: post.body, targetLocale: "ko" } }]);
    expect(requests(fetcher).some(item => item.url === "/api/content-translations")).toBe(false);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concert tonight");
  });
  it("C5b a reader who signs in is switched to the title/article request, not the display one", async () => {
    context.auth.authenticated = false;
    const fetcher = vi.fn(async (url: string) => url === "/api/content-translations" ? Response.json(slotAnswer({ title: "오늘 밤 콘서트", article: "공연장에서 만나요" })) : Response.json({ translatedText: "x" }));
    vi.stubGlobal("fetch", fetcher);
    const first = view(); first.unmount();
    context.auth.authenticated = true; fetcher.mockClear();
    view();
    expect(await screen.findByRole("heading", { level: 1, name: "오늘 밤 콘서트" })).toBeInTheDocument();
    expect(requests(fetcher).map(item => item.url)).toEqual(["/api/content-translations"]);
  });
});
