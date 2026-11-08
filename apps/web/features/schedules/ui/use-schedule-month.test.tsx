import { afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false, user: null, getAccessToken: async () => null }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
// The schedule projection has its own tests; here only the reads and the merge matter.
vi.mock("../domain/participation", () => ({ pageSchema: () => ({ parse: (value: unknown) => value }), scheduleSchema: {} }));
import { useScheduleMonth } from "./use-schedule-month";

afterEach(() => vi.unstubAllGlobals());

it("reads several creators one by one and merges them by id in time order", async () => {
  const pages: Record<string, unknown> = {
    a: { items: [{ id: "3", startsAt: "2026-09-20T00:00:00Z" }, { id: "1", startsAt: "2026-09-02T00:00:00Z" }], nextCursor: null },
    b: { items: [{ id: "2", startsAt: "2026-09-10T00:00:00+09:00" }, { id: "1", startsAt: "2026-09-02T00:00:00Z" }], nextCursor: null },
  };
  const request = vi.fn(async (input: RequestInfo | URL) => ({ ok: true, json: async () => pages[new URL(String(input), "https://byus.test").searchParams.get("celebritySlug") ?? ""] }) as Response);
  vi.stubGlobal("fetch", request);
  const { result } = renderHook(() => useScheduleMonth("2026-09", "ko", ["a", "b"], true));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.items.map((item) => item.id)).toEqual(["1", "2", "3"]);
  expect(request.mock.calls.map(([input]) => new URL(String(input), "https://byus.test").searchParams.get("celebritySlug"))).toEqual(["a", "b"]);
});

it("keeps the single-creator and month-wide reads as before", async () => {
  const request = vi.fn(async (_input: RequestInfo | URL) => ({ ok: true, json: async () => ({ items: [], nextCursor: null }) }) as Response);
  vi.stubGlobal("fetch", request);
  const { result } = renderHook(() => useScheduleMonth("2026-10", "ko"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(String(request.mock.calls[0]?.[0])).toBe("/api/schedules?month=2026-10&locale=ko");
});
