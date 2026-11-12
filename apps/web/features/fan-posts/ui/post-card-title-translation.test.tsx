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
// Only the translation requests count: the card makes other reads of its own.
const requests = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls.filter(([url]) => String(url).includes("translations")).map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) as Record<string, unknown> }));

// The hook memoizes requests per identity, locale, target and texts for the page; a new session generation keeps each case on its own.
beforeEach(() => { resetTranslationUnavailableForTest(); context.auth.authenticated = true; context.session.generation += 1; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("board post title translation", () => {
  it("C1 a signed-in reader gets the article translated from one request, the title stays, and the original switch restores the article", async () => {
    const fetcher = vi.fn(async () => Response.json(slotAnswer({ title: "오늘 밤 콘서트", article: "공연장에서 만나요" })));
    vi.stubGlobal("fetch", fetcher);
    view();
    expect(await screen.findByText("공연장에서 만나요")).toBeInTheDocument();
    // The title is never translated: it stays as written, with no language mark.
    expect(screen.getByRole("heading", { level: 1, name: "Concert tonight" })).not.toHaveAttribute("lang");
    expect(requests(fetcher)).toEqual([{ url: "/api/content-translations", body: { targetType: "fan_post", targetId: id, targetLocale: "ko", locale: "ko", slots: "title-body" } }]);
    fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("heading", { level: 1, name: "Concert tonight" })).toBeInTheDocument();
    expect(screen.getByText("See you all at the venue")).toBeInTheDocument();
    expect(screen.queryByText("공연장에서 만나요")).toBeNull();
    expect(requests(fetcher)).toHaveLength(1);
  });
  it("C2 a post with only a title (or a title in a foreign language only) asks for no translation and offers no switch", async () => {
    const fetcher = vi.fn(async () => Response.json(slotAnswer({ title: "오늘 밤 콘서트" })));
    vi.stubGlobal("fetch", fetcher);
    view({ ...post, body: "Concert tonight" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.getByRole("heading", { level: 1, name: "Concert tonight" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /번역 보기|원문 보기/ })).toBeNull();
    expect(requests(fetcher)).toHaveLength(0);
  });
  it("C3 an answer that lacks a requested slot, or has an extra one, leaves the original", async () => {
    const answers: Array<Record<string, string>> = [{ title: "오늘 밤 콘서트" }, { article: "공연장에서 만나요" }, { title: "오늘 밤 콘서트", article: "공연장에서 만나요" }];
    for (const slots of answers) {
      context.session.generation += 1;
      const fetcher = vi.fn(async () => Response.json(slotAnswer(slots)));
      vi.stubGlobal("fetch", fetcher);
      const { unmount } = view(post);
      await waitFor(() => expect(requests(fetcher)).toHaveLength(1));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concert tonight");
      expect(screen.queryByText("오늘 밤 콘서트")).toBeNull();
      unmount();
    }
  });
  it("C4 after a failed attempt the translate button retries and recovers", async () => {
    let attempts = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (!String(url).includes("translations")) return Response.json({});
      attempts += 1;
      return attempts === 1 ? Response.json({ error: { code: "TRANSLATION_FAILED" } }, { status: 503 }) : Response.json(slotAnswer({ title: "오늘 밤 콘서트", article: "공연장에서 만나요" }));
    });
    vi.stubGlobal("fetch", fetcher);
    view();
    await waitFor(() => expect(requests(fetcher)).toHaveLength(1));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concert tonight");
    fireEvent.click(await screen.findByRole("button", { name: "번역 보기" }));
    expect(await screen.findByText("공연장에서 만나요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concert tonight");
    expect(requests(fetcher)).toHaveLength(2);
  });
  it("C5 a guest keeps the title as written and translates the article through the display path only", async () => {
    context.auth.authenticated = false;
    const fetcher = vi.fn(async () => Response.json({ translatedText: "공연장에서 만나요" }));
    vi.stubGlobal("fetch", fetcher);
    view();
    await waitFor(() => expect(requests(fetcher).length).toBeGreaterThan(0));
    expect(requests(fetcher)).toEqual([{ url: "/api/display-translations", body: { text: "See you all at the venue", targetLocale: "ko" } }]);
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
    expect(await screen.findByText("공연장에서 만나요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Concert tonight" })).toBeInTheDocument();
    expect(requests(fetcher).map(item => item.url)).toEqual(["/api/content-translations"]);
  });
});
