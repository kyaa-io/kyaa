import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { CHEMI_BIRTH_CONSENT_VERSION, createChemiProfileHandlers, type ChemiProfileDependencies } from "./handlers";

const USER = "a3e1c2d4-0000-4000-8000-000000000001";
const PARTNER = "b3e1c2d4-0000-4000-8000-000000000002";
const original = process.env.CHEMI_TAB;
beforeEach(() => { process.env.CHEMI_TAB = "true"; });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });

const emptyProfile = { birth: null, consent: null, partners: [], partnerLimit: 10 };
const noSummary = { readingDays: 0, askThreads: 0, partners: 0, orders: 0, askPassesLeft: 0, sajuReading: false, fortuneToday: false, starToday: false };
const emptyResponse = { ...emptyProfile, birthMark: null, summary: noSummary };
function deps(rpc: ChemiProfileDependencies["rpc"] = vi.fn(async (name: string) => name === "chemi_my_birth_summary" ? noSummary : emptyProfile)) {
  return { rpc: vi.fn(rpc), authorize: vi.fn(async () => ({ appUserId: USER })) };
}
const json = (method: string, body: unknown) => new Request("http://localhost/api/chemi/x", {
  method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body),
});
const birth = { birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울", consent: true };

describe("chemi profile handlers", () => {
  it("answers 404 for every route while CHEMI_TAB is off, before auth or SQL", async () => {
    delete process.env.CHEMI_TAB;
    const d = deps();
    const h = createChemiProfileHandlers(d);
    for (const [run, request] of [[h.getProfile, json("GET", undefined)], [h.putBirth, json("PUT", birth)], [h.deleteBirth, json("DELETE", undefined)],
      [h.postPartner, json("POST", {})], [h.patchPartner, json("PATCH", {})], [h.deletePartner, json("DELETE", { partnerId: PARTNER })]] as const) {
      expect((await run(request)).status).toBe(404);
    }
    expect(d.authorize).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("requires login", async () => {
    const d = { rpc: vi.fn(), authorize: vi.fn(async () => { throw new AuthError("AUTHENTICATION_REQUIRED" as never, 401, "x"); }) };
    const response = await createChemiProfileHandlers(d).getProfile(json("GET", undefined));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHORIZED" } });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("reads the empty-state profile (no birth, no partners)", async () => {
    const response = await createChemiProfileHandlers(deps()).getProfile(new Request("http://localhost/api/chemi/profile", { headers: { authorization: "Bearer t" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(emptyResponse);
  });

  it("adds the birth mark (year pillar) and erase counts to a saved profile", async () => {
    const stored = { ...emptyProfile, birth: { birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울특별시", ageBand: "adult", editableFrom: null } };
    const counts = { readingDays: 34, askThreads: 6, partners: 2, orders: 6, askPassesLeft: 11, sajuReading: true, fortuneToday: true, starToday: false };
    const response = await createChemiProfileHandlers(deps(async (name) => name === "chemi_my_birth_summary" ? counts : stored)).getProfile(json("GET", undefined));
    expect(await response.json()).toMatchObject({ birthMark: { stem: "을", branch: "해", animal: "돼지", element: "wood" }, summary: counts });
    // 입춘 전(1995-01-20)은 앞해(갑술년 · 개띠), 입춘 날 시간을 모르면 해가 정해지지 않는다.
    const before = { ...stored, birth: { ...stored.birth, birthDate: "1995-01-20" } };
    expect((await (await createChemiProfileHandlers(deps(async (name) => name === "chemi_my_birth_summary" ? counts : before)).getProfile(json("GET", undefined))).json()).birthMark)
      .toMatchObject({ stem: "갑", branch: "술", animal: "개", element: "wood" });
  });

  it("saves birth with the server's consent version and maps the age band", async () => {
    const d = deps(async () => ({ ageBand: "minor", saved: true, edited: false, editableFrom: null }));
    const response = await createChemiProfileHandlers(d).putBirth(json("PUT", birth));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ageBand: "minor", edited: false, editableFrom: null });
    expect(d.rpc).toHaveBeenCalledWith("chemi_save_birth", {
      p_user: USER, p_birth_date: "1995-05-05", p_calendar: "solar", p_birth_time: "14:30", p_precision: "exact", p_gender: "female",
      p_birth_place: "서울", p_consent_version: CHEMI_BIRTH_CONSENT_VERSION,
    });
  });

  it("refuses malformed birth input without calling SQL", async () => {
    for (const body of [{ ...birth, consent: false }, { ...birth, birthDate: "1995-02-30" }, { ...birth, timePrecision: "unknown" },
      { ...birth, birthTime: null }, { ...birth, birthTime: "25:00" }, { ...birth, extra: 1 }, { ...birth, gender: "other" }]) {
      const d = deps();
      const response = await createChemiProfileHandlers(d).putBirth(json("PUT", body));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(d.rpc).not.toHaveBeenCalled();
    }
  });

  it("refuses a lunar date that does not exist (1995 has no leap 5th month) on every save route, before SQL", async () => {
    const leap = { birthDate: "1995-05-05", calendar: "lunar_leap" };
    const partner = { birthTime: null, timePrecision: "unknown", gender: null, nickname: "민지" };
    const cases = [
      ["putBirth", json("PUT", { ...birth, ...leap })],
      ["postPartner", json("POST", { ...partner, ...leap, source: "saju" })],
      ["patchPartner", json("PATCH", { ...partner, ...leap, partnerId: PARTNER })],
    ] as const;
    for (const [route, request] of cases) {
      const d = deps();
      const response = await createChemiProfileHandlers(d)[route](request);
      expect([route, response.status, await response.json()]).toEqual([route, 400, { error: { code: "CHEMI_INVALID_DATE" } }]);
      expect(d.rpc).not.toHaveBeenCalled();
    }
    // 같은 날짜라도 음력·양력으로 적으면 실제 있는 날이라 저장된다. 윤달이 실제 있는 해(2020 윤4월)도 저장된다.
    for (const body of [{ ...birth, birthDate: "1995-05-05", calendar: "lunar" }, { ...birth, birthDate: "2020-04-15", calendar: "lunar_leap" }]) {
      const d = deps(async () => ({ ageBand: "adult", saved: true, edited: false, editableFrom: null }));
      expect((await createChemiProfileHandlers(d).putBirth(json("PUT", body))).status, JSON.stringify(body)).toBe(200);
    }
  });

  it("still reads a profile saved with a lunar date that does not exist: the birth mark is empty, everything else stays reachable", async () => {
    const stored = { ...emptyProfile, birth: { birthDate: "1995-05-05", calendar: "lunar_leap", birthTime: null, timePrecision: "unknown", gender: null, birthPlace: null, ageBand: "adult", editableFrom: null } };
    const response = await createChemiProfileHandlers(deps(async (name) => name === "chemi_my_birth_summary" ? noSummary : stored)).getProfile(json("GET", undefined));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ birth: { birthDate: "1995-05-05", calendar: "lunar_leap" }, birthMark: null, summary: noSummary });
  });

  it("maps SQL refusals", async () => {
    const fail = (code: string) => deps(async (name) => { if (name === "chemi_read_profile") return { ...emptyProfile, birth: { ...birth, consent: undefined, ageBand: "adult", editableFrom: "2027-02-12T10:00:00+09:00" } }; throw new Error(code); });
    const under14 = await createChemiProfileHandlers(fail("CHEMI_UNDER_14")).putBirth(json("PUT", birth));
    expect([under14.status, await under14.json()]).toEqual([403, { error: { code: "CHEMI_UNDER_14" } }]);
    const limit = await createChemiProfileHandlers(fail("CHEMI_EDIT_LIMIT")).putBirth(json("PUT", birth));
    expect([limit.status, await limit.json()]).toEqual([409, { error: { code: "CHEMI_EDIT_LIMIT", editableFrom: "2027-02-12T10:00:00+09:00" } }]);
    const full2 = await createChemiProfileHandlers(fail("CHEMI_PARTNER_FULL")).postPartner(json("POST", { birthDate: "1997-03-12", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null, nickname: "민지", source: "saju" }));
    expect([full2.status, await full2.json()]).toEqual([409, { error: { code: "CHEMI_PARTNER_FULL" } }]);
    const closed = await createChemiProfileHandlers(fail("CHEMI_ACCOUNT_CLOSED")).deleteBirth(json("DELETE", undefined));
    expect(closed.status).toBe(403);
    const unknown = await createChemiProfileHandlers(deps(async () => { throw new Error("connection reset"); })).getProfile(json("GET", undefined));
    expect([unknown.status, await unknown.json()]).toEqual([503, { error: { code: "CHEMI_UNAVAILABLE" } }]);
  });

  it("adds and deletes partners", async () => {
    const d = deps(async (name) => name === "chemi_add_partner" ? { partnerId: PARTNER } : { deleted: false });
    const created = await createChemiProfileHandlers(d).postPartner(json("POST", { birthDate: "1997-03-12", calendar: "lunar", birthTime: null, timePrecision: "unknown", gender: null, nickname: " 민지 ", source: "saju" }));
    expect([created.status, await created.json()]).toEqual([201, { partnerId: PARTNER }]);
    expect(d.rpc).toHaveBeenCalledWith("chemi_add_partner", expect.objectContaining({ p_nickname: "민지", p_calendar: "lunar", p_birth_time: null }));
    const patch = { partnerId: PARTNER, birthDate: "1997-03-13", calendar: "solar", birthTime: "08:10", timePrecision: "exact", gender: "male", nickname: " 민지 " };
    const updated = await createChemiProfileHandlers(deps(async () => ({ updated: true }))).patchPartner(json("PATCH", patch));
    expect([updated.status, await updated.json()]).toEqual([200, { updated: true }]);
    const gone = deps(async () => ({ updated: false }));
    expect((await createChemiProfileHandlers(gone).patchPartner(json("PATCH", patch))).status).toBe(404);
    expect(gone.rpc).toHaveBeenCalledWith("chemi_update_partner", expect.objectContaining({ p_partner: PARTNER, p_nickname: "민지", p_birth_time: "08:10" }));
    expect((await createChemiProfileHandlers(deps()).patchPartner(json("PATCH", { ...patch, partnerId: "nope" }))).status).toBe(400);
    const missing = await createChemiProfileHandlers(d).deletePartner(json("DELETE", { partnerId: PARTNER }));
    expect(missing.status).toBe(404);
    expect((await createChemiProfileHandlers(d).deletePartner(json("DELETE", { partnerId: "nope" }))).status).toBe(400);
  });
});
