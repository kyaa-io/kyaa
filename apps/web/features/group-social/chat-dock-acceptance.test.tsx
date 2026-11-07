import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearResources } from "@/components/fan-ui/resource-cache";
import { resetChatDockStore, type ChatDockTarget } from "./chat-dock-store";
import { ChatDock } from "./chat-dock";

// Real resource hook, real conversation. Only the server is pretend, so this sees what a person sees while the other side answers.
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "did:privy:me" }, getAccessToken: vi.fn(async () => "token") }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "did:privy:me", generation: 0 }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], ready: false, invalid: false, add: vi.fn(), remove: vi.fn(), markUsed: vi.fn(), retry: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: () => null }));

const person = "10000000-0000-4000-8000-000000000001", chatId = "20000000-0000-4000-8000-000000000002", messageId = "30000000-0000-4000-8000-000000000003";
const target: ChatDockTarget = { owner: "did:privy:me", profileId: person, nickname: "별빛", avatarUrl: null, conversationId: chatId };
let chat: Record<string, unknown>, calls: { method: string; url: string }[];
const row = (over: Record<string, unknown>) => ({ id: chatId, profileId: person, nickname: "별빛", avatarUrl: null, status: "outgoing_request", canSend: false, latestMessage: "안녕", ...over });

beforeEach(() => {
  resetChatDockStore(); clearResources(); calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input), method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url.includes("/messages")) return Response.json({ messages: [{ id: messageId, senderProfileId: person, text: "첫 메시지", createdAt: "2026-11-07T00:00:00Z", isMine: false, attachment: null }] });
    if (method === "PATCH") { chat = row({ status: "accepted", canSend: true }); return Response.json({ id: chatId, status: "accepted" }); }
    return Response.json({ conversations: chat ? [chat] : [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens the message box within seconds after the other person accepts", async () => {
  chat = row({});
  render(<ChatDock locale="ko" target={target} />);
  expect(await screen.findByText("상대의 수락을 기다리고 있어요")).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "메시지" })).toBeNull();
  chat = row({ status: "accepted", canSend: true });
  expect(await screen.findByRole("textbox", { name: "메시지" }, { timeout: 7000 })).toBeVisible();
  expect(screen.queryByText("상대의 수락을 기다리고 있어요")).toBeNull();
}, 10000);

it("does not drop the conversation or take focus while waiting for that answer", async () => {
  chat = row({});
  render(<ChatDock locale="ko" target={target} />);
  const log = await screen.findByRole("log");
  chat = row({ status: "accepted", canSend: true });
  await screen.findByRole("textbox", { name: "메시지" }, { timeout: 7000 });
  expect(screen.getByRole("log")).toBe(log);
  expect(screen.getByRole("textbox", { name: "메시지" })).not.toHaveFocus();
}, 10000);

it("a failed check leaves the open conversation alone", async () => {
  chat = row({});
  render(<ChatDock locale="ko" target={target} />);
  const log = await screen.findByRole("log");
  const working = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => String(input).includes("/messages") ? working(input, init) : Response.json({ error: { code: "SOCIAL_UNAVAILABLE" } }, { status: 503 }));
  await new Promise(done => setTimeout(done, 3500));
  expect(screen.getByRole("log")).toBe(log);
  expect(screen.queryByText(/처리하지 못했어요/)).toBeNull();
  vi.mocked(fetch).mockImplementation(working);
  chat = row({ status: "accepted", canSend: true });
  expect(await screen.findByRole("textbox", { name: "메시지" }, { timeout: 7000 })).toBeVisible();
}, 15000);

it("does not ask in a hidden tab", async () => {
  chat = row({});
  render(<ChatDock locale="ko" target={target} />);
  await screen.findByRole("log");
  const before = calls.filter(call => !call.url.includes("/messages")).length;
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  await new Promise(done => setTimeout(done, 3500));
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  expect(calls.filter(call => !call.url.includes("/messages")).length).toBe(before);
}, 8000);

it("stops asking once the answer is in", async () => {
  chat = row({ status: "accepted", canSend: true });
  render(<ChatDock locale="ko" target={target} />);
  await screen.findByRole("textbox", { name: "메시지" });
  await new Promise(done => setTimeout(done, 3500));
  expect(calls.filter(call => call.url.endsWith("/api/me/social/conversations") || call.url.includes("/conversations?")).length).toBeLessThanOrEqual(1);
}, 8000);

it("says when the other person declined instead of offering a box that will be refused", async () => {
  chat = row({});
  render(<ChatDock locale="ko" target={target} />);
  await screen.findByText("상대의 수락을 기다리고 있어요");
  chat = row({ status: "rejected", canSend: false, retryAt: "2100-01-01T00:00:00Z" });
  expect(await screen.findByText("아직 다시 요청할 수 없어요", undefined, { timeout: 7000 })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "메시지" })).toBeNull();
}, 10000);

it("the receiver accepts in the window without losing the conversation, and lands in the box", async () => {
  chat = row({ status: "incoming_request" });
  render(<ChatDock locale="ko" target={target} />);
  const log = await screen.findByRole("log");
  expect(await within(log).findByText("첫 메시지")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "수락" }));
  const box = await screen.findByRole("textbox", { name: "메시지" }, { timeout: 3000 });
  expect(screen.getByRole("log")).toBe(log);
  expect(await within(log).findByText("첫 메시지")).toBeVisible();
  await waitFor(() => expect(box).toHaveFocus());
  expect(screen.queryByRole("button", { name: "수락" })).toBeNull();
  expect(screen.queryByText("메시지를 보낼 수 없어요.")).toBeNull();
}, 8000);

it("the receiver sees the request end if the sender cancels it", async () => {
  chat = row({ status: "incoming_request" });
  render(<ChatDock locale="ko" target={target} />);
  await screen.findByRole("button", { name: "수락" });
  chat = row({ status: "cancelled", canSend: false, retryAt: "2100-01-01T00:00:00Z" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "수락" })).toBeNull(), { timeout: 7000 });
}, 10000);
