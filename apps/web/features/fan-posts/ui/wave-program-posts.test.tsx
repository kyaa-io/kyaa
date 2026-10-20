import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { FanPostFeed } from "./fan-post-feed";
const state = vi.hoisted(() => ({ authenticated: true, failWrite: false }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: state.authenticated, user: { id: "viewer" }, getAccessToken: async () => "token" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "viewer", generation: 0 }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: ({ children }: { children: React.ReactNode }) => children }));
const endpoint = "/api/celebrities/kyaa-wave-fanpage/programs/wave-quiz/posts";
const returnTo = "/kyaa-wave-fanpage/programs/wave-quiz?locale=en";
beforeEach(() => {
  state.authenticated = true; state.failWrite = false;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method ? Response.json({ ok: true }, { status: state.failWrite ? 500 : 200 }) : Response.json({ items: [], nextCursor: null })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("program fan posts", () => {
  it("maps program posts into existing post cards and retains detail return paths", async () => {
    const post = { id: "10000000-0000-4000-8000-000000000001", celebritySlug: "kyaa-wave-fanpage", body: "Quiz memory", visibility: "public", revision: 1, author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", isOwner: false, likeCount: 0, liked: false, commentCount: 0 };
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: [post], nextCursor: null }));
    render(<FanPostFeed slug="kyaa-wave-fanpage" locale="en" program="wave-quiz" returnTo={returnTo} />);
    await screen.findByText("Quiz memory");
    expect(screen.getByRole("link", { name: contentCopy("en").comments + " 0" })).toHaveAttribute("href", expect.stringContaining(`returnTo=${encodeURIComponent(returnTo)}`));
  });
  it("reads the program endpoint, posts public content and refreshes stamps only on success", async () => {
    const onPosted = vi.fn();
    render(<FanPostFeed slug="kyaa-wave-fanpage" locale="en" program="wave-quiz" returnTo={returnTo} onPosted={onPosted} />);
    await screen.findByText(contentCopy("en").empty);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(endpoint + "?"), expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Write a post" }));
    expect(screen.queryByRole("button", { name: /Visibility/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Program story" } });
    state.failWrite = true;
    fireEvent.click(screen.getByRole("button", { name: contentCopy("en").publish }));
    await screen.findByRole("alert");
    expect(onPosted).not.toHaveBeenCalled();
    state.failWrite = false;
    fireEvent.click(screen.getByRole("button", { name: contentCopy("en").publish }));
    await waitFor(() => expect(onPosted).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST", body: expect.stringContaining('"visibility":"public"') }));
  });
  it("requires a written thank-you in Live Insight", async () => {
    render(<FanPostFeed slug="kyaa-wave-fanpage" locale="ko" program="live-insight" />);
    await screen.findByText(contentCopy("ko").empty);
    fireEvent.click(screen.getByRole("button", { name: "나영석 PD님께 감사평 남기기" }));
    expect(screen.getByRole("textbox")).toBeRequired();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "감사평을 적어 주세요.");
    expect(screen.getByRole("button", { name: contentCopy("ko").publish })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "좋은 이야기 감사합니다." } });
    expect(screen.getByRole("button", { name: contentCopy("ko").publish })).toBeEnabled();
  });
  it("preserves the program path through login", async () => {
    state.authenticated = false;
    render(<FanPostFeed slug="kyaa-wave-fanpage" locale="en" program="wave-quiz" returnTo={returnTo} />);
    expect(screen.getByRole("link", { name: contentCopy("en").login })).toHaveAttribute("href", `/login?locale=en&returnTo=${encodeURIComponent(returnTo)}`);
    await screen.findByText(contentCopy("en").empty);
  });
});
