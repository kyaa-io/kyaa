import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetAuthReadyDeadlineForTest } from "./public-read-auth";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";

// The sign-in SDK whose session refresh never answers (prod 2026-11-11 23:20): neither readiness nor a token ever arrives.
const never = () => new Promise<string>(() => {});
const auth = vi.hoisted(() => ({ ready: false, authenticated: false, user: null as { id: string } | null, getAccessToken: (() => new Promise<string>(() => {})) as () => Promise<string | null> }));
const session = vi.hoisted(() => ({ ready: true, ownerId: null as string | null, generation: 0 }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));

const parse = (value: unknown) => value as { n: number };
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  void url;
  const authorization = new Headers(init?.headers).get("authorization");
  if (String(url).startsWith("/api/me/") && !authorization) return Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 });
  return Response.json({ n: authorization ? 2 : 1 });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  resetAuthReadyDeadlineForTest();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(auth, { ready: false, authenticated: false, user: null, getAccessToken: never });
  Object.assign(session, { ready: true, ownerId: null, generation: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const settle = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

it("shows the public ranking as a guest within 6 seconds when sign-in never becomes ready", async () => {
  const hook = renderHook(() => useRankingResource("/api/rankings/home", parse));
  expect(hook.result.current.state.status).toBe("loading");
  await settle(6_000);
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 1 } });
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBeNull();
});

it("reads the ranking as a guest when a signed-in viewer's token never arrives, and keeps the rows while the member re-read runs", async () => {
  Object.assign(auth, { ready: true, authenticated: true, user: { id: "member-1" } });
  const hook = renderHook(() => useRankingResource("/api/rankings/home", parse));
  await settle(6_000);
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 1 } });
  Object.assign(auth, { getAccessToken: async () => "token" });
  act(() => hook.result.current.refresh());
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 1 } });
  await settle(10);
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 2 } });
});

it("never shows another member's ranking rows to a new owner", async () => {
  Object.assign(auth, { ready: true, authenticated: true, user: { id: "member-1" }, getAccessToken: async () => "token" });
  const hook = renderHook(() => useRankingResource("/api/rankings/home", parse));
  await settle(10);
  expect(hook.result.current.state.status).toBe("ready");
  fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
  Object.assign(auth, { user: { id: "member-2" } });
  hook.rerender();
  expect(hook.result.current.state).toEqual({ status: "loading" });
});

it("reads a public group page as a guest within 6 seconds when sign-in never becomes ready", async () => {
  const hook = renderHook(() => useGroupResource("/api/groups/resolve/kyaa", parse));
  expect(hook.result.current.loading).toBe(true);
  await settle(6_000);
  expect(hook.result.current.data).toEqual({ n: 1 });
  expect(hook.result.current.loading).toBe(false);
});

it("ends a member group read in the error state within 6 seconds when the token never arrives", async () => {
  Object.assign(auth, { ready: true, authenticated: true, user: { id: "member-1" } });
  const hook = renderHook(() => useGroupResource("/api/me/wallet", parse));
  await settle(6_000);
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.error).toBe(true);
  expect(hook.result.current.failure?.code).toBe("AUTH_REQUIRED");
  expect(fetchMock).not.toHaveBeenCalled();
});

// prod 2026-11-12 13:11: Privy signed in long before our session exchange finished; the home ranking ended in its error state.
it("reads the public ranking as a guest while a new sign-in is still being exchanged, then re-reads it as the member", async () => {
  Object.assign(auth, { ready: true, authenticated: true, user: { id: "member-1" }, getAccessToken: async () => "token" });
  Object.assign(session, { ready: false, ownerId: "member-1", generation: 1 });
  const hook = renderHook(() => useRankingResource("/api/rankings/home", parse));
  await settle(10);
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 1 } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBeNull();
  Object.assign(session, { ready: true });
  hook.rerender();
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 1 } });
  await settle(10);
  expect(hook.result.current.state).toEqual({ status: "ready", data: { n: 2 } });
  expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer token");
});
