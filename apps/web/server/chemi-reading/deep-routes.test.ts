import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as deep } from "@/app/api/chemi/fortune/deep/route";
import { GET as spreadState, POST as spreadDraw } from "@/app/api/chemi/tarot/spread/route";
import { isFortuneResult } from "@/app/chemi/fortune/reading";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ authorize: async () => ({ appUserId: "11111111-1111-4111-8111-111111111111" }), rpc }),
}));

const birth = { birthDate: "1995-05-05", birthTime: "14:30", calendar: "solar", gender: "female", timePrecision: "exact" };
const request = (body?: unknown) =>
  new Request("http://localhost/api", {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer test" },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  vi.stubEnv("CHEMI_TAB", "true");
  vi.stubEnv("CHEMI_TAROT_SALT", "disposable-test-salt-disposable-test");
  vi.useFakeTimers({ now: new Date("2026-11-21T03:00:00Z"), toFake: ["Date"] });
  rpc.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("returns seven consecutive days from today in KST without saving", async () => {
  rpc.mockResolvedValue({ birth });
  const body = await (await deep(request())).json();
  expect(body.today).toBe("2026-11-21");
  expect(body.days.map((row: { day: string }) => row.day)).toEqual([
    "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27",
  ]);
  expect(body.days.every((row: { result: Record<string, unknown> }) => isFortuneResult(row.result))).toBe(true);
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["chemi_read_profile"]);
});

it("uses the Korean date just after KST midnight", async () => {
  vi.setSystemTime(new Date("2026-11-21T15:05:00Z"));
  rpc.mockResolvedValue({ birth });
  expect((await (await deep(request())).json()).today).toBe("2026-11-22");
});

it("asks for a birthday before computing", async () => {
  rpc.mockResolvedValue({ birth: null });
  const response = await deep(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: { code: "CHEMI_BIRTH_REQUIRED" } });
});

it("reads the saved spread without drawing", async () => {
  rpc.mockResolvedValue({ readingId: null });
  expect(await (await spreadState(request())).json()).toEqual({ readingId: null });
  expect(rpc).toHaveBeenCalledWith("chemi_tarot_spread", expect.objectContaining({ p_result: null }));
});

it("draws three different cards for the chosen positions and saves them once", async () => {
  rpc.mockImplementation(async (_name, args) => ({ readingId: "r", result: args.p_result, replayed: false }));
  const first = await (await spreadDraw(request({ character: "elina", positions: [3, 40, 77] }))).json();
  const again = await (await spreadDraw(request({ character: "elina", positions: [3, 40, 77] }))).json();
  expect(first.result.cards).toHaveLength(3);
  expect(first.result.positions).toEqual([3, 40, 77]);
  expect(new Set(first.result.cards.map((card: { card: number }) => card.card)).size).toBe(3);
  expect(again.result).toEqual(first.result);
  expect(rpc).toHaveBeenLastCalledWith("chemi_tarot_spread", expect.objectContaining({ p_character: "elina", p_version: "tarot-v1" }));
});

it.each([[[1, 1, 2]], [[1, 2]], [[0, 1, 78]]])("rejects positions %j", async (positions) => {
  const response = await spreadDraw(request({ character: "changha", positions }));
  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalledWith("chemi_tarot_spread", expect.anything());
});

it("stays closed while the tab is off", async () => {
  vi.stubEnv("CHEMI_TAB", "false");
  for (const response of [await deep(request()), await spreadState(request()), await spreadDraw(request({}))]) {
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});
