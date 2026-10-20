import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true, ready: true, status: "ready", code: "UNAVAILABLE", retry: vi.fn(), read: vi.fn(), comments: vi.fn() }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: state.ready, authenticated: state.authenticated }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "mission-owner" }) }));
vi.mock("./use-fanpage-resource", () => ({ useFanpageResource: (url: string | null) => {
  state.read(url);
  return { state: { status: state.status, code: state.code, data: { progress: WAVE_MISSIONS.map(({ key }) => ({ key, status: key === "checkin" ? "completed" : "unverified" })) } }, retry: state.retry };
} }));
vi.mock("./use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "loading" } }) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: () => null, FanContentContainer: () => null }));
vi.mock("@/components/notice/notice-body", () => ({ NoticeBody: () => null }));
vi.mock("@/features/fan-posts/ui/fan-post-feed", () => ({ FanPostFeed: () => null }));
vi.mock("./notice-comments", () => ({ NoticeComments: (props: { slug: string; noticeSlug: string; locale: string; returnTo: string; onChanged: () => void }) => { state.comments(props); return <button onClick={props.onChanged}>Post cheer</button>; } }));
import { WAVE_MISSIONS } from "../domain/wave-missions";
import { WaveMissionProgress, WaveProgramsHome } from "./wave-programs";
afterEach(() => { cleanup(); state.authenticated = true; state.ready = true; state.status = "ready"; state.code = "UNAVAILABLE"; vi.clearAllMocks(); });

describe("Wave mission progress integration", () => {
  it("uses the owned endpoint and displays the mission list before program links without the program stamp sidebar", () => {
    render(<WaveProgramsHome locale="ko" />);
    expect(state.read).toHaveBeenCalledWith("/api/celebrities/kyaa-wave-fanpage/missions");
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10 · 완료");
    expect(screen.getByRole("heading", { name: "미션 진행" }).compareDocumentPosition(screen.getByRole("heading", { name: "프로그램" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("프로그램 스탬프")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(12);
  });
  it("mounts the separate home cheer notice board and refreshes missions after posting", () => {
    render(<WaveProgramsHome locale="ko" />);
    expect(screen.getByRole("region", { name: "응원하기" })).toHaveAttribute("id", "wave-home-cheer");
    expect(state.comments).toHaveBeenCalledWith(expect.objectContaining({
      slug: "kyaa-wave-fanpage", noticeSlug: "wave-home-cheer", locale: "ko",
      returnTo: "/kyaa-wave-fanpage?locale=ko#wave-home-cheer",
    }));
    screen.getByRole("button", { name: "Post cheer" }).click();
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it("offers sign-in with the original locale and never fetches as a guest", () => {
    state.authenticated = false;
    render(<WaveMissionProgress locale="ja" />);
    expect(state.read).toHaveBeenCalledWith(null);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/login?locale=ja&returnTo=${encodeURIComponent("/kyaa-wave-fanpage?locale=ja")}`);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it.each(["loading", "error"])("does not display a completed count before a successful read: %s", status => {
    state.status = status;
    render(<WaveMissionProgress locale="ko" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole(status === "loading" ? "status" : "alert")).toBeTruthy();
  });
  it.each(["FAN_WEB_FORBIDDEN", "WAVE_CHECKIN_REQUIRED"])("explains the receipt requirement and retries a failed read: %s", code => {
    state.status = "error"; state.code = code;
    render(<WaveMissionProgress locale="ko" />);
    expect(screen.getByRole("alert")).toHaveTextContent("행사 참여를 완료한 뒤");
    screen.getByRole("button", { name: "다시 시도" }).click();
    expect(state.retry).toHaveBeenCalledOnce();
  });
});

it("refreshes mission progress after a same-owner activity and ignores other owners", () => {
  render(<WaveMissionProgress locale="ko" />);
  window.dispatchEvent(new CustomEvent("byus:fan-activity-updated", { detail: { ownerId: "other-owner" } }));
  expect(state.retry).not.toHaveBeenCalled();
  window.dispatchEvent(new CustomEvent("byus:fan-activity-updated", { detail: { ownerId: "mission-owner" } }));
  expect(state.retry).toHaveBeenCalledOnce();
});
