import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eventParticipantPresets } from "../../admin/event-participants";
import { openPageLikeEvent, pageLikeEventWindows } from "../domain/page-like-event";
import fanActionStyles from "@/components/fan-ui/fan-action.module.css";
import { EventLikeCard } from "./event-like-card";
import { ReactionAction } from "./reaction-action";

const privy = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  user: { id: "owner-a" } as { id: string } | undefined,
  getAccessToken: vi.fn<() => Promise<string | null>>().mockResolvedValue("token"),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => privy }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/groups/ui/group-page-context", () => ({ useOptionalGroupPage: () => ({ page: { kind: "fan", likeCount: 1234, memberCount: 7 } }) }));

const reactionId = "11111111-1111-4111-8111-111111111111";
const saved = { reactionId, status: "completed", mintStatus: "queued", blockchainJobId: null, fanActionOutboxId: "22222222-2222-4222-8222-222222222222", created: true, passportExists: true };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const inWindow = new Date("2026-11-17T13:05:00+09:00");

/** GET은 눌리기 전까지 반응 없음, POST 뒤에는 저장된 반응을 돌려주는 서버. */
function stubServer() {
  let liked = false;
  const fetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { liked = true; return response(saved); }
    return response({ reaction: liked ? { ...saved, created: false } : null });
  });
  vi.stubGlobal("fetch", fetch);
  return { posts: () => fetch.mock.calls.filter(([, init]) => init?.method === "POST") };
}

afterEach(() => {
  privy.ready = true;
  privy.authenticated = true;
  privy.user = { id: "owner-a" };
  privy.getAccessToken.mockReset().mockResolvedValue("token");
  router.push.mockReset();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("EventLikeCard", () => {
  it("shows the event name, a big like button and the like count only while that creator's window is open", async () => {
    stubServer();
    render(<EventLikeCard slug="elina" locale="ko" now={inWindow} />);
    expect(screen.getByRole("heading", { name: "엘리나 × Kyaa" })).toBeInTheDocument();
    const button = await screen.findByRole("button", { name: "좋아요 남기기" });
    expect(button).toBeEnabled();
    expect(button.className).toContain(fanActionStyles.lg);
    expect(screen.getByText("팬 1,234")).toBeInTheDocument();
  });

  it("uses the English event name and wording", async () => {
    stubServer();
    render(<EventLikeCard slug="elina" locale="en" now={inWindow} />);
    expect(screen.getByRole("heading", { name: "Elina × Kyaa" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Leave a like" })).toBeInTheDocument();
  });

  it.each([
    ["just before the window", "elina", "2026-11-16T23:59:59+09:00"],
    ["at the exclusive end of the window", "elina", "2026-11-24T00:00:00+09:00"],
    ["another creator's window", "changha", "2026-11-17T13:05:00+09:00"],
    ["a creator without an event", "kara", "2026-11-17T13:05:00+09:00"],
  ])("renders nothing for %s", (_, slug, at) => {
    stubServer();
    const { container } = render(<EventLikeCard slug={slug} locale="ko" now={new Date(at)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends a guest through the same sign-in flow as the chip and returns to the card", async () => {
    privy.authenticated = false;
    privy.user = undefined;
    stubServer();
    render(<EventLikeCard slug="elina" locale="ko" now={inWindow} />);
    const login = await screen.findByRole("link", { name: "좋아요 남기기" });
    await waitFor(() => expect(login.getAttribute("href")).toContain("/login"));
    // 11/17: the fan page resets link colour unless the link says it is the primary action (pink with dark text on DEV).
    expect(login).toHaveAttribute("data-fan-action-emphasis", "primary");
    fireEvent.click(login);
    expect(router.push).toHaveBeenCalledTimes(1);
    const destination = String(router.push.mock.calls[0]![0]);
    expect(destination).toContain("/login");
    expect(destination).toContain("authIntent=");
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem(sessionStorage.key(0)!)).toContain("#event-like");
  });

  it("sends one reactions POST when a signed-in fan presses it, then shows the finished state", async () => {
    const server = stubServer();
    render(<EventLikeCard slug="elina" locale="ko" now={inWindow} />);
    fireEvent.click(await screen.findByRole("button", { name: "좋아요 남기기" }));
    expect(await screen.findByText("좋아요 완료")).toBeInTheDocument();
    expect(document.querySelector("#event-like [data-fan-action-status]")!.className).toContain(fanActionStyles.lg);
    expect(screen.queryByRole("button", { name: "좋아요 남기기" })).not.toBeInTheDocument();
    expect(server.posts()).toHaveLength(1);
    expect(String(server.posts()[0]![0])).toBe("/api/celebrities/elina/reactions");
  });

  it("keeps the header chip and the card in one state with a single POST", async () => {
    const server = stubServer();
    render(<><ReactionAction slug="elina" locale="ko" variant="header" likeCount={452} /><EventLikeCard slug="elina" locale="ko" now={inWindow} /></>);
    const chip = await screen.findByRole("button", { name: "좋아요 452" });
    fireEvent.click(await screen.findByRole("button", { name: "좋아요 남기기" }));
    fireEvent.click(chip);
    await waitFor(() => expect(document.querySelectorAll('[data-reaction-complete="true"]')).toHaveLength(2));
    expect(screen.getByText("좋아요 완료 · 452")).toBeDisabled();
    expect(screen.getByText("좋아요 완료")).toBeInTheDocument();
    expect(server.posts()).toHaveLength(1);
  });

  it("completes the card too when the chip is pressed first", async () => {
    const server = stubServer();
    render(<><ReactionAction slug="elina" locale="ko" variant="header" likeCount={452} /><EventLikeCard slug="elina" locale="ko" now={inWindow} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "좋아요 452" }));
    await waitFor(() => expect(document.querySelectorAll('[data-reaction-complete="true"]')).toHaveLength(2));
    expect(server.posts()).toHaveLength(1);
  });
});

describe("page-like event windows", () => {
  it("keeps Elina, Changha and Yuna open from each start day until 11/24 00:00 (KST), not for one day", () => {
    expect(openPageLikeEvent("elina", new Date("2026-11-16T23:59:59+09:00"))).toBeUndefined();
    expect(openPageLikeEvent("elina", new Date("2026-11-17T00:00:00+09:00"))?.key).toBe("elina-onboarding-1117");
    expect(openPageLikeEvent("elina", new Date("2026-11-18T00:00:00+09:00"))?.key).toBe("elina-onboarding-1117");
    expect(openPageLikeEvent("elina", new Date("2026-11-23T23:59:59+09:00"))?.key).toBe("elina-onboarding-1117");
    expect(openPageLikeEvent("elina", new Date("2026-11-24T00:00:00+09:00"))).toBeUndefined();
    expect(openPageLikeEvent("changha", new Date("2026-11-17T23:59:59+09:00"))).toBeUndefined();
    expect(openPageLikeEvent("changha", new Date("2026-11-20T12:00:00+09:00"))?.key).toBe("changha-onboarding-1118");
    expect(openPageLikeEvent("changha", new Date("2026-11-23T12:00:00+09:00"))?.key).toBe("changha-onboarding-1118");
    expect(openPageLikeEvent("changha", new Date("2026-11-24T00:00:00+09:00"))).toBeUndefined();
    expect(openPageLikeEvent("yuna", new Date("2026-11-18T23:59:59+09:00"))).toBeUndefined();
    expect(openPageLikeEvent("yuna", new Date("2026-11-19T00:00:00+09:00"))?.key).toBe("yuna-onboarding-1119");
    expect(openPageLikeEvent("yuna", new Date("2026-11-23T23:59:59+09:00"))?.key).toBe("yuna-onboarding-1119");
    expect(openPageLikeEvent("yuna", new Date("2026-11-24T00:00:00+09:00"))).toBeUndefined();
  });

  it("keeps Changha's unreleased-photo window (11/22~23) as its own counted window", () => {
    expect(pageLikeEventWindows["changha-photo-1122"]).toMatchObject({ from: "2026-11-22T00:00:00+09:00", to: "2026-11-24T00:00:00+09:00" });
  });

  it("is the same definition the admin participant presets count", () => {
    for (const window of Object.values(pageLikeEventWindows)) {
      expect(eventParticipantPresets).toContainEqual({ key: window.key, event: "page-like", slug: window.slug, from: window.from, to: window.to });
    }
  });
});
