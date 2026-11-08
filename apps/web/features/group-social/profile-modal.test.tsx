import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/features__group-social__reach";
import { resetChatDockStore, useChatDockTarget } from "./chat-dock-store";
import { dmReason, dmStateOf } from "./profile-reach";
import { reachText, type ReachKey } from "./reach-copy";
import { reachSource } from "./reach-source";
import { ProfileModal } from "./profile-modal";

const mock = vi.hoisted(() => ({ data: undefined as unknown, error: false, failure: undefined as { status: number } | undefined, loading: false, request: vi.fn(), retry: vi.fn() }));
vi.mock("@/features/groups/ui/use-group-resource", () => {
  class GroupRequestError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
  return { GroupRequestError, useGroupResource: (url: string, parse: (value: unknown) => unknown) => ({ ...mock, url, ownerKey: "did:privy:me:3", data: mock.data === undefined ? undefined : parse(mock.data) }) };
});
vi.mock("@/features/groups/ui/groups-release", () => ({ useGroupsRelease: () => true }));

const id = "10000000-0000-4000-8000-000000000001";
const person = { profileId: id, nickname: "별빛", avatarUrl: null };
const profile = (over: Record<string, unknown> = {}) => ({
  profile: { id, nickname: "별빛", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: {} } },
  relationship: { friendshipId: null, status: "none" }, dm: { conversationId: null, status: "none", canSend: false },
  capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false, reach: { dmState: "available", artist: false },
  favorite: { name: "숨겨야 할 값" }, activities: [{ title: "숨겨야 할 활동" }], email: "private@example.test", ...over,
});
const Target = () => { const target = useChatDockTarget(); return <output data-testid="dock">{target ? `${target.owner}|${target.profileId}|${target.conversationId}` : "closed"}</output>; };
const open = (onClose = vi.fn()) => { render(<><ProfileModal person={person} locale="ko" onClose={onClose}/><Target/></>); return onClose; };
const dm = () => screen.getByRole("button", { name: "대화하기" });

beforeEach(() => { resetChatDockStore(); vi.clearAllMocks(); mock.data = profile(); mock.error = false; mock.failure = undefined; mock.loading = false; mock.request.mockResolvedValue({}); });
afterEach(cleanup);

describe("what the modal shows", () => {
  it("shows name, picture and grade only, and nothing else the API returns", async () => {
    open();
    expect(await screen.findByRole("dialog", { name: "별빛" })).toBeVisible();
    expect(screen.getByText("골드")).toBeVisible();
    expect(screen.queryByText(/숨겨야 할/)).toBeNull(); expect(screen.queryByText(/private@/)).toBeNull();
    expect(screen.queryByText(/비공개/)).toBeNull();
  });
  it("shows the page grade from the row over the account grade", () => {
    render(<ProfileModal person={{ ...person, tier: "Silver" }} locale="ko" onClose={vi.fn()}/>);
    expect(screen.getByText("실버")).toBeVisible(); expect(screen.queryByText("골드")).toBeNull();
  });
  it("marks a verified artist with the shared tag", () => {
    mock.data = profile({ reach: { dmState: "available", artist: true } }); open();
    expect(screen.getByText("인증 아티스트")).toBeVisible();
  });
  it("uses the row's name while loading, with no buttons to press yet", () => {
    mock.data = undefined; mock.loading = true; open();
    expect(screen.getByRole("heading", { name: "별빛" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "대화하기" })).toBeNull();
  });
  it("offers no friend or message action on your own profile, only a way to edit it", () => {
    mock.data = profile({ isSelf: true, reach: { dmState: "self", artist: false } }); open();
    expect(screen.queryByRole("button", { name: "대화하기" })).toBeNull(); expect(screen.queryByRole("button", { name: "친구 추가하기" })).toBeNull();
    expect(screen.getByRole("link", { name: "프로필 수정" })).toHaveAttribute("href", "/settings?locale=ko&section=profile");
  });
  it("closes by button and returns focus to where it was opened", async () => {
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const onClose = vi.fn(), view = render(<ProfileModal person={person} locale="ko" onClose={onClose}/>);
    await waitFor(() => expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "닫기" })); expect(onClose).toHaveBeenCalledOnce();
    view.unmount(); await waitFor(() => expect(document.activeElement).toBe(trigger)); trigger.remove();
  });
  it("closes with Escape", async () => { const onClose = open(); await waitFor(() => expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus()); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(onClose).toHaveBeenCalled(); });
});

describe("the message button says why before it is pressed", () => {
  it.each<[string, string]>([
    ["not_eligible", "같은 페이지에 가입한 팬이나 친구에게 보낼 수 있어요"],
    ["recipient_off", "상대가 대화를 꺼 두었어요"],
    ["friends_only", "상대가 친구의 대화 요청만 받아요"],
    ["limit", "오늘 보낼 수 있는 요청을 다 썼어요"],
    ["pending", "상대의 수락을 기다리고 있어요"],
    ["retry_later", "아직 다시 요청할 수 없어요"],
    ["blocked", "메시지를 보낼 수 없어요."],
  ])("%s", (dmState, text) => {
    mock.data = profile({ capabilities: { canRequestFriend: false, canRequestDm: false, canBlock: true }, reach: { dmState, artist: false } }); open();
    expect(dm()).toBeDisabled(); expect(screen.getByText(text)).toBeVisible();
    expect(dm()).toHaveAttribute("aria-describedby", screen.getByText(text).id);
    expect(mock.request).not.toHaveBeenCalled();
  });
  it.each([404, 403])("a closed profile (%i) looks the same as a block, with no reason given", status => {
    mock.data = undefined; mock.error = true; mock.failure = { status }; open();
    expect(dm()).toBeDisabled(); expect(screen.getByText("메시지를 보낼 수 없어요.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "친구 추가하기" })).toBeNull(); expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });
  it("a server failure offers a retry instead of a reason", () => {
    mock.data = undefined; mock.error = true; mock.failure = { status: 503 }; open();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" })); expect(mock.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("메시지를 보낼 수 없어요.")).toBeNull();
  });
  it("available shows no reason and opens the chat window for this person", () => {
    const onClose = open();
    expect(dm()).toBeEnabled(); expect(screen.queryByText(/보낼 수/)).toBeNull();
    fireEvent.click(dm());
    expect(onClose).toHaveBeenCalledOnce(); expect(screen.getByTestId("dock")).toHaveTextContent(`did:privy:me|${id}|null`);
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("an existing conversation and an incoming request open it too", () => {
    mock.data = profile({ dm: { conversationId: id, status: "incoming_request", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: false, canBlock: true }, reach: { dmState: "incoming", artist: false } }); open();
    fireEvent.click(dm()); expect(screen.getByTestId("dock")).toHaveTextContent(`|${id}|${id}`);
  });
  it("falls back to the capabilities when the state is missing", () => {
    const facts = { capabilities: { canRequestDm: true }, dm: { conversationId: null, status: "none", canSend: false } };
    expect(dmStateOf(facts)).toBe("available");
    expect(dmStateOf({ ...facts, reach: null, capabilities: { canRequestDm: false } })).toBe("blocked");
    expect(dmStateOf({ ...facts, reach: null, capabilities: { canRequestDm: false }, dm: { conversationId: id, status: "outgoing_request", canSend: false } })).toBe("pending");
    expect(dmStateOf({ ...facts, isSelf: true })).toBe("self");
    expect(dmReason("ko", "available")).toBeNull();
  });
});

describe("friend action", () => {
  it("sends one request, keeps its identity on retry, and rereads", async () => {
    mock.request.mockRejectedValueOnce(new Error("network")); open();
    const add = screen.getByRole("button", { name: "친구 추가하기" }); fireEvent.click(add);
    expect(await screen.findByRole("alert")).toBeVisible();
    await act(async () => { fireEvent.click(add); });
    await waitFor(() => expect(mock.retry).toHaveBeenCalledOnce());
    const [first, second] = mock.request.mock.calls;
    expect(first[0]).toBe("/api/me/social/friends"); expect(JSON.parse(first[1].body).requestId).toBe(JSON.parse(second[1].body).requestId);
  });
  it("accepts an incoming request and shows other relationships as states", async () => {
    mock.data = profile({ relationship: { friendshipId: id, status: "incoming" }, capabilities: { canRequestFriend: false, canRequestDm: true, canBlock: true } }); const view = render(<ProfileModal person={person} locale="ko" onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "친구 요청 수락" }));
    await waitFor(() => expect(mock.request).toHaveBeenCalledWith(`/api/me/social/friends/${id}`, expect.objectContaining({ method: "PATCH" })));
    view.unmount();
    mock.data = profile({ relationship: { friendshipId: id, status: "friends" }, capabilities: { canRequestFriend: false, canRequestDm: true, canBlock: true } }); const friends = render(<ProfileModal person={person} locale="ko" onClose={vi.fn()}/>);
    expect(screen.getByRole("button", { name: "친구" })).toBeDisabled(); friends.unmount();
    mock.data = profile({ relationship: { friendshipId: id, status: "outgoing" }, capabilities: { canRequestFriend: false, canRequestDm: true, canBlock: true } }); render(<ProfileModal person={person} locale="ko" onClose={vi.fn()}/>);
    expect(screen.getByRole("button", { name: "수락 대기 중" })).toBeDisabled();
  });
});

it("fills every added locale", () => {
  expect(Object.keys(messages).sort()).toEqual(Object.keys(reachSource).sort());
  for (const locale of APP_LOCALES) for (const key of Object.keys(reachSource) as ReachKey[]) expect(reachText(locale, key).trim(), `${locale} ${key}`).toBeTruthy();
  expect(reachText("ko", "recipientOff")).toBe("상대가 대화를 꺼 두었어요");
  expect(reachText("en", "recipientOff")).toBe("They turned off messages");
});

describe("public card (261107-2 C2)", () => {
  const card = { favorite: { slug: "elina", name: "엘리나" }, links: ["https://www.instagram.com/star_fan", "https://linktr.ee/star"], bio: "엘리나 콘서트 3번 다녀옴", stats: { creator: { slug: "elina", name: "엘리나" }, tier: "Gold", points: 1234, stamps: 7, hearts: 12 } };
  it("shows grade · favorite, three numbers, the links and the intro the fan wrote", () => {
    mock.data = profile({ card }); open();
    expect(screen.getByText("골드 · 최애 엘리나")).toBeVisible();
    const numbers = screen.getByText("하트").closest("dl")!;
    expect(numbers).toHaveTextContent("하트12포인트1,234P누적 도장7");
    const instagram = screen.getByRole("link", { name: "Instagram @star_fan" });
    expect(instagram).toHaveAttribute("target", "_blank"); expect(instagram.getAttribute("rel")).toContain("noopener");
    expect(instagram).toHaveAttribute("data-outbound-kind", "social");
    expect(screen.getByRole("link", { name: "linktr.ee" })).toHaveAttribute("href", "https://linktr.ee/star");
    expect(screen.getByText("엘리나 콘서트 3번 다녀옴")).toBeVisible();
  });
  it("draws no link row and no intro when the fan wrote none, and leaves the favorite out", () => {
    mock.data = profile({ card: { ...card, favorite: null, links: [], bio: null } }); open();
    expect(screen.queryByRole("list", { name: "SNS 링크" })).toBeNull();
    expect(screen.queryByText(/최애/)).toBeNull();
    expect(screen.getByText("하트")).toBeVisible();
  });
  it("draws no numbers without a page or favorite, and says so when the card failed", () => {
    mock.data = profile({ card: { favorite: null, links: [], bio: null, stats: null } }); const view = render(<ProfileModal person={person} locale="ko" onClose={vi.fn()}/>);
    expect(screen.queryByText("하트")).toBeNull(); expect(screen.queryByText("수치를 불러오지 못했어요")).toBeNull();
    view.unmount();
    mock.data = profile({ card: null }); render(<ProfileModal person={person} locale="ko" onClose={vi.fn()}/>);
    expect(screen.getByText("수치를 불러오지 못했어요")).toBeVisible();
  });
  it("refuses a link that is not https even if the server sent one", () => {
    mock.data = profile({ card: { ...card, links: ["javascript:alert(1)"] } }); open();
    expect(screen.queryByRole("link", { name: /alert/ })).toBeNull();
    expect(screen.getByText("수치를 불러오지 못했어요")).toBeVisible();
  });
  it("asks for the page's numbers when opened from a page", async () => {
    const seen: string[] = [];
    const resourceModule = await import("@/features/groups/ui/use-group-resource");
    const spy = vi.spyOn(resourceModule, "useGroupResource").mockImplementation(((url: string) => { seen.push(url); return { ...mock, url, ownerKey: "k", data: undefined }; }) as never);
    render(<ProfileModal person={{ ...person, pageId: "20000000-0000-4000-8000-000000000002" }} locale="ko" onClose={vi.fn()}/>);
    expect(seen[0]).toBe(`/api/me/social/profiles/${id}?locale=ko&pageId=20000000-0000-4000-8000-000000000002`);
    spy.mockRestore();
  });
  it("hides everything from a closed profile", () => {
    mock.data = undefined; mock.error = true; mock.failure = { status: 404 }; open();
    expect(screen.queryByText("하트")).toBeNull(); expect(screen.queryByRole("list", { name: "SNS 링크" })).toBeNull();
  });
});
