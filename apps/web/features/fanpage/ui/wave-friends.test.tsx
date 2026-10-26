import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import { WaveFriends } from "./wave-friends";

const state = vi.hoisted(() => ({
  friendships: [] as { id: string; profileId: string; nickname: string; avatarUrl: string; status: string }[],
  members: [] as {profileId:string; nickname:string; avatarUrl:string}[], nextCursor: null as string | null, friendsStatus: "ready", membersStatus: "ready", urls: [] as string[], relationship: "none", isSelf: false, hasMore: false, retry: vi.fn(),
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: "viewer" }, getAccessToken: async () => "token" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ownerId: "viewer", generation: 0, ready: true }) }));
vi.mock("./wave-friend-scanner", () => ({ WaveFriendScanner: () => <p>Scanner</p> }));
vi.mock("./use-fanpage-resource", () => ({ useFanpageResource: (url: string) => { state.urls.push(url); return ({
  retry: state.retry,
  state: { status: url.includes("/members?") ? state.membersStatus : url === "/api/kyaa-wave/friends?locale=ko" ? state.friendsStatus : "ready", data: url.includes("/members?") ? {members:state.members,nextCursor:state.nextCursor} : url.includes("/messages") ? { messages: [], hasMore: state.hasMore }
    : url.includes("/profile-links/") ? { profile: { id: "22222222-2222-4222-8222-222222222222", nickname: "Scanned participant", avatarUrl: "/images/avatars/star-pink.webp" }, relationship: { status: state.relationship, friendshipId: "33333333-3333-4333-8333-333333333333" }, isSelf: state.isSelf }
    : { friendships: state.friendships } },
}); } }));
const copy = waveFriendsCopy("ko");
const friend = (status: string, index: number) => ({ id: `00000000-0000-4000-8000-00000000000${index}`, profileId: `10000000-0000-4000-8000-00000000000${index}`, nickname: status, avatarUrl: "/images/avatars/star-pink.webp", status });
const response = (ok: boolean) => ({ ok, json: async () => ok ? { success: true } : { error: { code: "PRIVATE_DETAIL" } } }) as Response;
const fetchMock = vi.fn<typeof fetch>();
function requestBody(index = 0) { return JSON.parse(fetchMock.mock.calls[index][1]!.body as string); }
function openProfile() { history.replaceState(null, "", "/kyaa-wave-fanpage?tab=friends&friend=11111111-1111-4111-8111-111111111111"); render(<WaveFriends locale="ko" />); }

beforeEach(() => { state.friendships = []; state.members = []; state.nextCursor = null; state.friendsStatus = "ready"; state.membersStatus = "ready"; state.urls = []; state.relationship = "none"; state.isSelf = false; state.hasMore = false; state.retry.mockReset(); fetchMock.mockReset(); fetchMock.mockResolvedValue(response(true)); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, "", "/"); });

describe("Wave friends", () => {
  it("offers relationship-specific member actions without translating check-in names", async () => {
    state.friendships = [friend("friends",1),friend("incoming",2),friend("outgoing",3)];
    state.members = [...state.friendships,friend("none",4)];
    render(<WaveFriends locale="ko" />);
    const directory = within(screen.getByRole("region",{name:copy.membersTitle}));
    expect(directory.getByText("none")).toBeInTheDocument();
    expect(directory.getByRole("status")).toHaveTextContent(copy.pending);
    fireEvent.click(directory.getByRole("button",{name:`incoming · ${copy.accept}`}));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledOnce());
    expect(requestBody().action).toBe("accept");
  });
  it.each(["loading","error"])("locks member actions when friendship status is %s", status => {
    state.friendsStatus=status; state.members=[friend("none",4)]; render(<WaveFriends locale="ko" />);
    const directory=within(screen.getByRole("region",{name:copy.membersTitle}));
    expect(directory.getByRole("button",{name:copy.requestFriend})).toBeDisabled();
    expect(directory.getByRole("status")).toHaveTextContent(status === "loading" ? copy.relationshipLoading : copy.relationshipError);
  });
  it("keeps member pages on mutation failure, reuses request ID and allows back from invalid cursor", async () => {
    state.members=[friend("none",4)]; state.nextCursor=state.members[0].profileId;
    const view=render(<WaveFriends locale="ko" />);
    fireEvent.click(screen.getByRole("button",{name:copy.nextPage}));
    const directory=within(screen.getByRole("region",{name:copy.membersTitle}));
    fetchMock.mockResolvedValueOnce(response(false));
    fireEvent.click(directory.getByRole("button",{name:`none · ${copy.requestFriend}`}));
    await waitFor(()=>expect(state.retry).toHaveBeenCalledOnce());
    expect(state.urls.at(-1)).toContain(`after=${state.members[0].profileId}`);
    fireEvent.click(directory.getByRole("button",{name:`none · ${copy.requestFriend}`}));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestBody(1)).toEqual(requestBody(0));
    state.membersStatus="error";view.rerender(<WaveFriends locale="ko" />);
    expect(screen.getByRole("button",{name:copy.previousPage})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:copy.previousPage}));
    expect(state.urls.at(-1)).not.toContain("after=");
  });
  it("counts only accepted friends and separates pending requests", () => {
    state.friendships = [friend("friends", 1), friend("incoming", 2), friend("outgoing", 3)];
    render(<WaveFriends locale="ko" />);
    expect(screen.getByRole("heading", { name: "친구 1명" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.incoming })).getByText("incoming")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.outgoing })).getByText("outgoing")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /대화하기/ })).toHaveLength(1);
  });
  it.each([["incoming", "accept", "accept"], ["incoming", "reject", "reject"], ["outgoing", "cancel", "cancel"]] as const)("handles %s %s", async (status, label, action) => {
    state.friendships = [friend(status, 1)]; render(<WaveFriends locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: copy[label] }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/kyaa-wave/friends/${state.friendships[0].id}`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(requestBody()).toEqual({ action, requestId: expect.any(String) });
    await waitFor(() => expect(state.retry).toHaveBeenCalledOnce());
  });
  it("requests friendship from a QR profile and waits for approval", async () => {
    openProfile(); fireEvent.click(await screen.findByRole("button", { name: copy.requestFriend }));
    await waitFor(() => expect(screen.getByText(copy.requested)).toBeInTheDocument());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/kyaa-wave/friends");
    expect(requestBody()).toEqual({ profileId: "22222222-2222-4222-8222-222222222222", requestId: expect.any(String) });
    expect(screen.queryByRole("button", { name: copy.requestFriend })).not.toBeInTheDocument();
  });
  it.each([["outgoing", false, "requested"], ["friends", false, "alreadyFriends"], ["none", true, "selfQr"]] as const)("does not offer a duplicate request for %s (self=%s)", async (relationship, isSelf, label) => {
    state.relationship = relationship; state.isSelf = isSelf; openProfile();
    expect(await screen.findByText(copy[label])).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.requestFriend })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([false, true])("shows the recent-message limit only when older messages exist (%s)", async hasMore => {
    state.hasMore = hasMore; state.friendships = [friend("friends", 1)];
    render(<WaveFriends locale="ko" />); fireEvent.click(screen.getByRole("button", { name: /대화하기/ }));
    await screen.findByRole("textbox", { name: copy.messageLabel });
    expect(Boolean(screen.queryByText(copy.recentMessages))).toBe(hasMore);
  });
  it("keeps the DM draft and request ID after failure, and blocks duplicate sends while busy", async () => {
    state.friendships = [friend("friends", 1)];
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<WaveFriends locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: /대화하기/ }));
    const input = await screen.findByRole("textbox", { name: copy.messageLabel });
    fireEvent.change(input, { target: { value: "  See you tomorrow!  " } });
    const send = screen.getByRole("button", { name: copy.send });
    fireEvent.click(send);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(send).toBeDisabled();
    expect(screen.getByRole("button", { name: copy.close })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(send);
    fireEvent.submit(input.closest("form")!);
    expect(fetchMock).toHaveBeenCalledOnce();
    const first = requestBody();
    await act(async () => { finish(response(false)); });
    expect(input).toHaveValue("  See you tomorrow!  ");
    expect(screen.getByRole("alert")).toHaveTextContent(copy.error);
    expect(screen.queryByText("PRIVATE_DETAIL")).not.toBeInTheDocument();
    fireEvent.click(send);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestBody(1)).toEqual(first);
    expect(first.text).toBe("See you tomorrow!");
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByText(copy.sent)).toBeInTheDocument();
    expect(state.retry).toHaveBeenCalledOnce();
  });
});
