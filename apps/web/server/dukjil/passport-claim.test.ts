import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createRoadmapHandler } from "./roadmap";
import { createClaimHandler } from "./claim";
import type { DukjilDependencies } from "./routes";

const owner = "11111111-1111-4111-8111-111111111111", passport = "22222222-2222-4222-8222-222222222222", creator = "33333333-3333-4333-8333-333333333333", key = "44444444-4444-4444-8444-444444444444", stamp = "55555555-5555-4555-8555-555555555555";
const deps: DukjilDependencies = { authorize: vi.fn(async () => ({ appUserId: owner })), rpc: vi.fn(), resolveOwnedPassportCreator: vi.fn(async (id: string, user: string) => (id === passport && user === owner ? creator : null)) };
const dbSlots = Array.from({ length: 9 }, (_, i) => ({ slot: i + 1, action: i < 8 ? `k${i + 1}` : null, filled: i < 8, stampId: i < 8 ? stamp : null, clearedAt: i < 8 ? "2026-11-06T00:00:00Z" : null }));
const dbRoadmap = { passportId: passport, hearts: 0, jjinfan: false, pages: [{ pageNo: 1, slots: dbSlots, filled: 8, claimable: false, claimed: false, locked: true, lockReason: "PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN" }] };
const roadmap = { passportId: passport, celebrityId: creator, hearts: 0, jjinfan: false, pages: [{ pageNo: 1, filled: 8, claimable: false, claimed: false, locked: true, lockedReason: "jjinfan_required", slots: dbSlots.map((s) => ({ slotNo: s.slot, kind: s.action, state: s.filled ? "filled" : "empty", stampId: s.stampId, clearedAt: s.clearedAt })) }] };
const post = (body: unknown) => new Request("https://fixture.test/claim", { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json" }, body: JSON.stringify(body) });
const get = () => new Request("https://fixture.test/roadmap", { headers: { authorization: "Bearer x" } });
beforeEach(() => vi.clearAllMocks());

describe("passport roadmap", () => {
  it("reads the owner's roadmap with server-owned identity", async () => {
    vi.mocked(deps.rpc).mockResolvedValue(dbRoadmap);
    const res = await createRoadmapHandler(deps).roadmap(get(), passport);
    expect(res.status).toBe(200); expect(await res.json()).toEqual(roadmap);
    expect(deps.rpc).toHaveBeenCalledWith("read_passport_roadmap", { p_user: owner, p_celebrity: creator });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("maps a missing passport to 404 and a bad id to 400 without calling the database", async () => {
    expect((await createRoadmapHandler({ ...deps, resolveOwnedPassportCreator: vi.fn(async () => null) }).roadmap(get(), passport)).status).toBe(404);
    expect(deps.rpc).not.toHaveBeenCalled();
    vi.mocked(deps.rpc).mockRejectedValue(new Error("PASSPORT_REQUIRED"));
    expect((await createRoadmapHandler(deps).roadmap(get(), passport)).status).toBe(403);
    vi.mocked(deps.rpc).mockClear();
    expect((await createRoadmapHandler(deps).roadmap(get(), "nope")).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("does not pass a malformed roadmap through", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ ...dbRoadmap, pages: [{ ...dbRoadmap.pages[0], slots: [] }] });
    expect((await createRoadmapHandler(deps).roadmap(get(), passport)).status).toBe(503);
  });
});

describe("passport page claim", () => {
  const result = { hearts: 1, pageNo: 1, jjinfanConfirmed: true, cheerStampId: stamp, replayed: false };
  it("resolves the creator from the owned passport and claims one heart", async () => {
    vi.mocked(deps.rpc).mockResolvedValue(result);
    const res = await createClaimHandler(deps).claim(post({ requestKey: key }), passport, "1");
    expect(res.status).toBe(200); expect(await res.json()).toEqual(result);
    expect(deps.rpc).toHaveBeenLastCalledWith("claim_passport_page", { p_user: owner, p_celebrity: creator, p_page_no: 1, p_request_key: key });
  });
  it("rejects owner or creator injection, bad page numbers and missing keys before the database", async () => {
    const c = createClaimHandler(deps);
    for (const [body, page] of [[{ requestKey: key, appUserId: owner }, "1"], [{ requestKey: key, celebrityId: creator }, "1"], [{}, "1"], [{ requestKey: key }, "0"], [{ requestKey: key }, "1.5"], [{ requestKey: key }, "x"]] as const) {
      expect((await c.claim(post(body), passport, page)).status).toBe(400);
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("maps claim refusals to stable codes", async () => {
    for (const [code, status] of [["PASSPORT_PAGE_NOT_COMPLETE", 409], ["PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN", 403], ["PASSPORT_REQUIRED", 403]] as const) {
      vi.mocked(deps.rpc).mockRejectedValue(new Error(`${code}: secret`));
      const res = await createClaimHandler(deps).claim(post({ requestKey: key }), passport, "2");
      expect(res.status).toBe(status); expect(JSON.stringify(await res.json())).toBe(JSON.stringify({ error: { code } }));
    }
  });
});
