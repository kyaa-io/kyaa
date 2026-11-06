import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatDockOwner, closeChatDock, openChatDock, resetChatDockStore, useChatDockTarget } from "./chat-dock-store";
import { ChatDock } from "./chat-dock";
import { ChatDockHost } from "./chat-dock-host";

const mock = vi.hoisted(() => ({ data: { conversations: [] } as unknown, error: false, loading: false, ready: true, authenticated: true, ownerKey: "did:privy:me:0", request: vi.fn(), retry: vi.fn(), path: "/elina" }));
vi.mock("@/features/groups/ui/use-group-resource", () => {
  class GroupRequestError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
  return { GroupRequestError, useGroupRequest: () => mock, useGroupResource: () => mock };
});
vi.mock("next/navigation", () => ({ usePathname: () => mock.path }));
vi.mock("next/dynamic", () => ({ default: () => function Dock() { return <div data-testid="dock"/>; } }));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));
vi.mock("./conversation", () => ({ parseConversations: (value: unknown) => value, Conversation: ({ id, onResolve }: { id: string; onResolve: (a: string) => void }) => <div data-testid="conversation" data-id={id}><button onClick={() => onResolve("accept")}>수락</button></div> }));

const person = "10000000-0000-4000-8000-000000000001", chat = "20000000-0000-4000-8000-000000000002";
const target = { owner: "did:privy:me", profileId: person, nickname: "별빛", avatarUrl: null, conversationId: null };
const row = (over = {}) => ({ id: chat, profileId: person, nickname: "별빛", avatarUrl: null, status: "accepted", canSend: true, latestMessage: "안녕", ...over });
const Current = () => <output data-testid="current">{useChatDockTarget()?.profileId ?? "closed"}</output>;

beforeEach(() => { resetChatDockStore(); vi.clearAllMocks(); Object.assign(mock, { data: { conversations: [] }, error: false, loading: false, ready: true, authenticated: true, ownerKey: "did:privy:me:0", path: "/elina" }); mock.request.mockResolvedValue({ id: chat }); });
afterEach(cleanup);

it("is a labelled window that does not lock the page, and focuses the message box when opened", () => {
  openChatDock(target);
  render(<ChatDock locale="ko" target={target}/>);
  const dock = screen.getByRole("dialog", { name: "별빛" });
  expect(dock).not.toHaveAttribute("aria-modal");
  expect(screen.getByRole("textbox", { name: "메시지" })).toHaveFocus();
});
it("does not take focus when it comes back after a reload or page change", () => {
  render(<ChatDock locale="ko" target={target}/>);
  expect(screen.getByRole("textbox", { name: "메시지" })).not.toHaveFocus();
});
it("sends a first message with one identity across retries, then follows the new conversation", async () => {
  openChatDock(target);
  mock.request.mockRejectedValueOnce(new Error("network"));
  render(<ChatDock locale="ko" target={target}/>);
  fireEvent.change(screen.getByRole("textbox", { name: "메시지" }), { target: { value: "안녕하세요" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  await waitFor(() => expect(mock.retry).toHaveBeenCalledOnce());
  const [first, second] = mock.request.mock.calls;
  expect(first[0]).toBe("/api/me/social/conversations");
  expect(JSON.parse(first[1].body)).toMatchObject({ profileId: person, text: "안녕하세요" });
  expect(JSON.parse(first[1].body).requestId).toBe(JSON.parse(second[1].body).requestId);
});
it("says why a first message was refused in its own words", async () => {
  const { GroupRequestError } = await import("@/features/groups/ui/use-group-resource");
  mock.request.mockRejectedValueOnce(new GroupRequestError(429, "SOCIAL_RATE_LIMITED"));
  render(<ChatDock locale="ko" target={target}/>);
  fireEvent.change(screen.getByRole("textbox", { name: "메시지" }), { target: { value: "안녕" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("오늘 보낼 수 있는 요청을 다 썼어요")).toBeVisible();
});
it("shows an existing conversation, and the expand link goes to the full screen and closes the window", () => {
  mock.data = { conversations: [row()] }; openChatDock(target);
  render(<><ChatDock locale="ko" target={target}/><Current/></>);
  expect(screen.getByTestId("conversation")).toHaveAttribute("data-id", chat);
  const expand = screen.getByRole("link", { name: "전체 화면으로 보기" });
  expect(expand).toHaveAttribute("href", `/my/friends?locale=ko&conversationId=${chat}`);
  expand.addEventListener("click", event => event.preventDefault());
  fireEvent.click(expand); expect(screen.getByTestId("current")).toHaveTextContent("closed");
});
it("treats a finished conversation as a new request, not a dead end", () => {
  mock.data = { conversations: [row({ status: "cancelled", canSend: false })] };
  render(<ChatDock locale="ko" target={target}/>);
  expect(screen.queryByTestId("conversation")).toBeNull(); expect(screen.getByRole("textbox", { name: "메시지" })).toBeVisible();
});
it("accepts an incoming request from the window", async () => {
  mock.data = { conversations: [row({ status: "incoming_request", canSend: false })] };
  render(<ChatDock locale="ko" target={target}/>);
  fireEvent.click(screen.getByRole("button", { name: "수락" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(`/api/me/social/conversations/${chat}`, expect.objectContaining({ method: "PATCH" })));
  expect(JSON.parse(mock.request.mock.calls[0][1].body)).toMatchObject({ action: "accept" });
});
it("closes with Escape and the close button", () => {
  openChatDock(target);
  render(<><ChatDock locale="ko" target={target}/><Current/></>);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "메시지" }), { key: "Escape" });
  expect(screen.getByTestId("current")).toHaveTextContent("closed");
  openChatDock(target); fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.getByTestId("current")).toHaveTextContent("closed");
});
it.each([[{ authenticated: false, ownerKey: "guest:1" }], [{ ownerKey: "did:privy:other:0" }]])("never shows a chat to anyone but its owner: %j", state => {
  Object.assign(mock, state); mock.data = { conversations: [row()] }; openChatDock(target);
  render(<><ChatDock locale="ko" target={target}/><Current/></>);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByTestId("conversation")).toBeNull();
  expect(screen.getByTestId("current")).toHaveTextContent("closed");
});
it("keeps the person when only the session generation changes", () => {
  expect(chatDockOwner("did:privy:me:0")).toBe("did:privy:me"); expect(chatDockOwner("did:privy:me:7")).toBe("did:privy:me");
});
it("stays open across pages and a reload, and steps aside on the full friends screen", () => {
  const view = render(<ChatDockHost/>); expect(screen.queryByTestId("dock")).toBeNull();
  openChatDock(target); view.rerender(<ChatDockHost/>); expect(screen.getByTestId("dock")).toBeVisible();
  mock.path = "/pages/groups"; view.rerender(<ChatDockHost/>); expect(screen.getByTestId("dock")).toBeVisible();
  mock.path = "/my/friends"; view.rerender(<ChatDockHost/>); expect(screen.queryByTestId("dock")).toBeNull();
  expect(JSON.parse(sessionStorage.getItem("kyaa.chat-dock")!)).toMatchObject({ profileId: person });
  closeChatDock(); expect(sessionStorage.getItem("kyaa.chat-dock")).toBeNull();
});
