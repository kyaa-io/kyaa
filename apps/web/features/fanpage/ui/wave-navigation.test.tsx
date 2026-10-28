import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { WaveNavigation, WAVE_SECTIONS, waveSectionHref } from "./wave-navigation";
import { wavePrivacyCopy } from "@/i18n/catalogs/features__fanpage__wave-privacy";
import { waveNavigationCopy } from "@/i18n/catalogs/features__fanpage__wave-navigation";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
const state = vi.hoisted(() => ({ ready: true, authenticated: false, status: "ready", friendships: [] as { id: string; nickname: string; avatarUrl: string; status: string }[], members: [] as { profileId: string; nickname: string; avatarUrl: string }[] }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => state }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ownerId: "viewer", generation: 0, ready: true }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: vi.fn() }) }));
vi.mock("./use-fanpage-resource", () => ({ useFanpageResource: (url: string) => ({ state: { status: state.status, data: url.startsWith("/api/kyaa-wave/friends/members?") ? { members: state.members, nextCursor: null } : { friendships: state.friendships } }, retry: vi.fn() }) }));
import { WaveFriends } from "./wave-friends";
afterEach(() => { cleanup(); state.ready = true; state.authenticated = false; state.status = "ready"; state.friendships = []; state.members = []; });
describe("Wave navigation", () => {
  it.each(APP_LOCALES)("preserves menu order, destinations and a single active link in %s", locale => {
    render(<WaveNavigation locale={locale} active="media" />);
    expect(screen.getByText(wavePrivacyCopy(locale).notice)).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(waveNavigationCopy(locale).labels);
    expect(links.map(link => link.getAttribute("href"))).toEqual(WAVE_SECTIONS.map(section => waveSectionHref(section, locale)));
    expect(links.filter(link => link.getAttribute("aria-current") === "page")).toEqual([links[5]]);
    expect(new URL(links[1].getAttribute("href")!, "https://kyaa.io").searchParams.get("source")).toBe("fans");
    expect(links[4]).toHaveAttribute("href", `/kyaa-wave-fanpage/programs/live-insight?locale=${locale}`);
  });
  it("returns guests to the friends menu after login", () => {
    render(<WaveFriends locale="ko" />);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", `/login?locale=ko&returnTo=${encodeURIComponent(waveSectionHref("friends", "ko"))}`);
    expect(screen.queryByText("오늘 만난 사람과 친구가 되어보세요")).toBeNull();
  });
  it.each(["loading", "error"])("does not confuse %s with an empty friends list", status => {
    state.authenticated = true; state.status = status; render(<WaveFriends locale="ko" />);
    const copy = waveFriendsCopy("ko");
    const friends = screen.getByRole("region", { name: copy.title });
    const directory = screen.getByRole("region", { name: copy.membersTitle });
    const role = status === "error" ? "alert" : "status";
    const friendsStates = within(friends).getAllByRole(role).filter(node => !directory.contains(node));
    expect(friendsStates).toHaveLength(1);
    expect(friendsStates[0]).toHaveTextContent(status === "error" ? copy.error : copy.loading);
    if (status === "error") {
      expect(within(directory).getByRole("alert")).toHaveTextContent(copy.error);
      expect(within(directory).getByRole("status")).toHaveTextContent(copy.relationshipError);
    } else {
      expect(within(directory).getAllByRole("status").map(node => node.textContent)).toEqual([copy.relationshipLoading, copy.loading]);
    }
    expect(within(directory).queryByText(copy.membersEmpty)).toBeNull();
    expect(screen.queryByText("오늘 만난 사람과 친구가 되어보세요")).toBeNull();
  });
  it("counts accepted friends and shows pending requests in separate sections", () => {
    state.authenticated = true;
    state.friendships = ["friends", "incoming", "outgoing"].map((status, i) => ({ id: String(i), nickname: status, avatarUrl: "/images/avatars/star-pink.webp", status }));
    state.members = [{ profileId: "directory-profile", nickname: "참가자", avatarUrl: "/images/avatars/star-pink.webp" }];
    render(<WaveFriends locale="ko" />);
    expect(screen.getByRole("heading", { name: "친구 1명" })).toBeInTheDocument();
    const directory = screen.getByRole("region", { name: "체크인한 참가자" });
    expect(within(directory).getAllByRole("listitem")).toHaveLength(1);
    expect(within(directory).getByText("참가자")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter(node => !directory.contains(node))).toHaveLength(3);
    expect(within(screen.getByRole("region", { name: "받은 친구 요청" })).getByText("incoming")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "보낸 친구 요청" })).getByText("outgoing")).toBeInTheDocument();
  });
});
