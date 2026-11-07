import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ME_RESOURCE_FRESH_MS } from "@/components/fan-ui/resource-cache";
import { useGroupResource, useGroupRequest } from "./use-group-resource";

const auth = vi.hoisted(() => ({ ready: true, authenticated: false, user: null as { id: string } | null, getAccessToken: vi.fn(async () => "token") }));
const session = vi.hoisted(() => ({ ready: true, ownerId: null as string | null, generation: 0 }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));

const parse = (value: unknown) => value as { n: number };
let served = 0;
const fetchMock = vi.fn(async () => Response.json({ n: ++served }));
beforeEach(() => {
  served = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(auth, { authenticated: false, user: null });
  Object.assign(session, { ownerId: null, generation: 0 });
});

it("gives a remount the stored value at once, with no loading and no second call inside 30 seconds", async () => {
  const first = renderHook(() => useGroupResource("/api/groups/a", parse));
  expect(first.result.current.loading).toBe(true);
  await waitFor(() => expect(first.result.current.data?.n).toBe(1));
  first.unmount();
  const second = renderHook(() => useGroupResource("/api/groups/a", parse));
  expect(second.result.current.loading).toBe(false);
  expect(second.result.current.refreshing).toBe(false);
  expect(second.result.current.data?.n).toBe(1);
  await act(async () => {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("shows a value older than 30 seconds and reads again behind it", async () => {
  const now = vi.spyOn(Date, "now");
  const start = Date.now();
  now.mockReturnValue(start);
  const first = renderHook(() => useGroupResource("/api/groups/a", parse));
  await waitFor(() => expect(first.result.current.data?.n).toBe(1));
  first.unmount();
  now.mockReturnValue(start + 30_001);
  const second = renderHook(() => useGroupResource("/api/groups/a", parse));
  expect(second.result.current.data?.n).toBe(1);
  expect(second.result.current.loading).toBe(false);
  expect(second.result.current.refreshing).toBe(true);
  await waitFor(() => expect(second.result.current.data?.n).toBe(2));
  expect(second.result.current.refreshing).toBe(false);
  now.mockRestore();
});
it("re-reads personal values behind the stored one once the short first-load window has passed", async () => {
  const first = renderHook(() => useGroupResource("/api/me/x", parse));
  await waitFor(() => expect(first.result.current.data?.n).toBe(1));
  first.unmount();
  const joined = renderHook(() => useGroupResource("/api/me/x", parse));
  expect(joined.result.current.data?.n).toBe(1);
  joined.unmount();
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + ME_RESOURCE_FRESH_MS + 1);
  const second = renderHook(() => useGroupResource("/api/me/x", parse));
  expect(second.result.current.data?.n).toBe(1);
  await waitFor(() => expect(second.result.current.data?.n).toBe(2));
  clock.mockRestore();
});
it("drops the stored value on retry and after a write", async () => {
  const view = renderHook(() => ({ resource: useGroupResource("/api/groups/a", parse), request: useGroupRequest().request }));
  await waitFor(() => expect(view.result.current.resource.data?.n).toBe(1));
  act(() => view.result.current.resource.retry());
  await waitFor(() => expect(view.result.current.resource.data?.n).toBe(2));
  await act(async () => { await view.result.current.request("/api/groups/a/membership", { method: "POST", body: "{}" }); });
  view.unmount();
  const after = renderHook(() => useGroupResource("/api/groups/a", parse));
  expect(after.result.current.loading).toBe(true);
  await waitFor(() => expect(after.result.current.data).toBeDefined());
});
it("a presence heartbeat does not drop stored values", async () => {
  const view = renderHook(() => ({ resource: useGroupResource("/api/groups/a", parse), request: useGroupRequest().request }));
  await waitFor(() => expect(view.result.current.resource.data?.n).toBe(1));
  await act(async () => { await view.result.current.request("/api/groups/a/presence", { method: "PUT" }); });
  view.unmount();
  const after = renderHook(() => useGroupResource("/api/groups/a", parse));
  expect(after.result.current.loading).toBe(false);
});
it("never shows the previous member's value after the owner changes", async () => {
  Object.assign(auth, { authenticated: true, user: { id: "member-a" } });
  Object.assign(session, { ownerId: "member-a", generation: 1 });
  const view = renderHook(() => useGroupResource("/api/groups/a", parse));
  await waitFor(() => expect(view.result.current.data?.n).toBe(1));
  Object.assign(auth, { authenticated: false, user: null });
  Object.assign(session, { ownerId: null, generation: 2 });
  view.rerender();
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.loading).toBe(true);
  await waitFor(() => expect(view.result.current.data?.n).toBe(2));
});
