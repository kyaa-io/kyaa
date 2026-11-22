import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true, fail: false, hasComment: false, author: undefined as unknown, comments: null as unknown[] | null }));
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => ({ ready: true, authenticated: state.authenticated, getAccessToken: async () => "token" }) }));
vi.mock("./use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { author: state.author, comments: state.comments ?? (state.hasComment ? [{ id: "home-cheer-comment", body: "응원해요", nickname: "팬", avatarUrl: "/avatar.png", createdAt: "2026-10-21T00:00:00Z", isOwner: true }] : []), total: state.hasComment ? 1 : 0, nextCursor: null } }, retry: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: () => null }));
const toast = vi.hoisted(() => ({ reward: vi.fn(), skip: vi.fn() }));
vi.mock("@/features/fan-posts/ui/mission-reward-toast", () => ({ showMissionRewardToast: toast.reward }));
vi.mock("@/features/fan-posts/ui/mission-skip-notice", () => ({ announceMissionSkip: toast.skip }));
import { NoticeComments } from "./notice-comments";
const returnTo = "/kyaa-wave-fanpage/programs/live-insight?locale=ko";
beforeEach(() => { state.authenticated = true; state.fail = false; state.hasComment = false; state.author = undefined; state.comments = null; vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: state.fail ? 500 : 200 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("program comment context", () => {
  it.each([returnTo, "/kyaa-wave-fanpage?locale=ko#wave-home-cheer"])("retains comment return path in login: %s", returnTo => { state.authenticated = false; render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="live-insight" locale="ko" returnTo={returnTo} />); expect(screen.getByRole("link")).toHaveAttribute("href", `/login?locale=ko&returnTo=${encodeURIComponent(returnTo)}`); });
  it("notifies only after successfully posting", async () => {
    const onPosted = vi.fn(), onChanged = vi.fn(); render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="live-insight" locale="ko" returnTo={returnTo} onPosted={onPosted} onChanged={onChanged} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "기억에 남는 순간" } });
    state.fail = true; fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("alert"); expect(onPosted).not.toHaveBeenCalled(); expect(onChanged).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(onPosted).toHaveBeenCalledOnce()); expect(screen.getByRole("textbox")).toHaveValue(""); expect(onChanged).toHaveBeenCalledOnce();
  });
  it("celebrates the points a comment earned, and says why when it earned none", async () => {
    toast.reward.mockClear(); toast.skip.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "33333333-3333-4333-8333-333333333333", replayed: false, reward: { points: 3, stamps: 1 } })));
    render(<NoticeComments slug="elina" noticeSlug="walk" locale="ko" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "오늘 소식 고마워요" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(toast.reward).toHaveBeenCalledExactlyOnceWith("ko", "comment", { points: 3, stamps: 1 }));
    expect(toast.skip).not.toHaveBeenCalled();
    const skipped = { id: "33333333-3333-4333-8333-333333333334", replayed: false, reward: { points: 0, stamps: 0, skippedReason: "too_short" } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(skipped)));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "굿" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(toast.skip).toHaveBeenCalledExactlyOnceWith("ko", "comment", skipped));
    expect(toast.reward).toHaveBeenCalledOnce();
  });
  it("notifies home mission refresh only after a successful deletion", async () => {
    state.hasComment = true;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onPosted = vi.fn(), onChanged = vi.fn();
    render(<NoticeComments slug="kyaa-wave-fanpage" noticeSlug="wave-home-cheer" locale="ko" onPosted={onPosted} onChanged={onChanged} />);
    state.fail = true; fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await screen.findByRole("alert"); expect(onChanged).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(onPosted).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith("/api/notice-comments/home-cheer-comment", expect.objectContaining({ method: "DELETE" }));
  });
});
describe("comment author name", () => {
  const fan = { name: "개인닉", official: null };
  const operator = { name: "개인닉", official: { name: "앙상블 패치워크", avatarUrl: "/images/creators/ensemble.webp" } };
  const posted = () => JSON.parse(String((vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit).body));
  it("shows the personal name and posts personally when the page name is not available", async () => {
    state.author = fan; render(<NoticeComments slug="elina" noticeSlug="walk" locale="ko" />);
    expect(screen.getByText("개인닉")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /작성 이름/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "반가워요" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(posted()).not.toHaveProperty("asOfficial");
  });
  it("starts with the personal name and posts under the page name only when chosen", async () => {
    state.author = operator; render(<NoticeComments slug="ensemble-patchwork" noticeSlug="walk" locale="ko" />);
    const pill = screen.getByRole("button", { name: "작성 이름: 개인닉" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "개인 인사" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(posted()).not.toHaveProperty("asOfficial");
    fireEvent.click(pill);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "앙상블 패치워크" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "작성 이름: 앙상블 패치워크" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "공식 인사" } }); fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(posted()).toMatchObject({ body: "공식 인사", asOfficial: true });
  });
  it("marks official comments with the verified mark and leaves personal ones plain", () => {
    state.comments = [
      { id: "11111111-1111-4111-8111-111111111111", body: "공식 인사", nickname: "앙상블 패치워크", avatarUrl: "/images/creators/ensemble.webp", createdAt: "2026-11-22T00:00:00Z", isOwner: false, isOfficial: true, artist: false },
      { id: "22222222-2222-4222-8222-222222222222", body: "팬 인사", nickname: "개인닉", avatarUrl: "/avatar.png", createdAt: "2026-11-22T00:00:00Z", isOwner: false, isOfficial: false, artist: false },
    ];
    render(<NoticeComments slug="ensemble-patchwork" noticeSlug="walk" locale="ko" />);
    expect(screen.getAllByText("인증 아티스트")).toHaveLength(1);
    expect(screen.getByText("앙상블 패치워크").parentElement).toHaveTextContent("인증 아티스트");
    expect(screen.getByText("개인닉").parentElement).not.toHaveTextContent("인증 아티스트");
  });
});
