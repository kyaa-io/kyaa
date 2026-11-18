import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { CHEMI_BIRTH_CONSENT_VERSION, createChemiProfileHandlers, type ChemiProfileDependencies } from "./handlers";
import { chemiPartnerFingerprint } from "./fingerprint";

const USER = "a3e1c2d4-0000-4000-8000-000000000001";
const PARTNER = "b3e1c2d4-0000-4000-8000-000000000002";
const original = process.env.CHEMI_TAB;
beforeEach(() => { process.env.CHEMI_TAB = "true"; });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });

const emptyProfile = { birth: null, consent: null, partners: [], partnerLimit: 10 };
function deps(rpc: ChemiProfileDependencies["rpc"] = vi.fn(async () => emptyProfile)) {
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
      [h.postPartner, json("POST", {})], [h.deletePartner, json("DELETE", { partnerId: PARTNER })]] as const) {
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
    expect(await response.json()).toEqual(emptyProfile);
  });

  it("saves birth with the server's consent version and maps the age band", async () => {
    const d = deps(async () => ({ ageBand: "minor", saved: true, edited: false, editableFrom: null }));
    const response = await createChemiProfileHandlers(d).putBirth(json("PUT", birth));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ageBand: "minor", edited: false, editableFrom: null });
    expect(d.rpc).toHaveBeenCalledWith("chemi_save_birth_v2", {
      p_user: USER, p_birth_date: "1995-05-05", p_calendar: "solar", p_birth_time: "14:30", p_precision: "exact", p_gender: "female",
      p_birth_place: "서울", p_place_code: null, p_lat: null, p_lon: null, p_tz: null, p_term_side: null, p_consent_version: CHEMI_BIRTH_CONSENT_VERSION,
    });
    expect(d.rpc).not.toHaveBeenCalledWith("chemi_save_birth", expect.anything());
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

  it("adds partners through v2 and deletes them with the stored partner's fingerprint", async () => {
    const SALT = "ab".repeat(32);
    const stored = { id: PARTNER, nickname: "민지", birthDate: "1997-03-12", calendar: "lunar", birthTime: null, timePrecision: "unknown", gender: null, source: "saju", lastUsedAt: "2027-01-13T00:00:00Z" };
    let deleted = false;
    const d = deps(async (name) => {
      if (name === "chemi_add_partner_v2") return { partnerId: PARTNER, rev: 7 };
      if (name === "chemi_read_profile") return { ...emptyProfile, partners: deleted ? [] : [stored] };
      if (name === "chemi_fp_salt") return SALT;
      if (name === "chemi_delete_partner_v2") { deleted = true; return { deleted: true }; }
      throw new Error(`unexpected ${name}`);
    });
    const created = await createChemiProfileHandlers(d).postPartner(json("POST", { birthDate: "1997-03-12", calendar: "lunar", birthTime: null, timePrecision: "unknown", gender: null, nickname: " 민지 ", source: "saju" }));
    expect([created.status, await created.json()]).toEqual([201, { partnerId: PARTNER }]);
    expect(d.rpc).toHaveBeenCalledWith("chemi_add_partner_v2", expect.objectContaining({ p_nickname: "민지", p_calendar: "lunar", p_birth_time: null, p_place_code: null }));
    const removed = await createChemiProfileHandlers(d).deletePartner(json("DELETE", { partnerId: PARTNER }));
    expect([removed.status, await removed.json()]).toEqual([200, { deleted: true }]);
    const fp = d.rpc.mock.calls.find(([name]) => name === "chemi_delete_partner_v2")?.[1]?.p_fp;
    expect(fp).toBe(chemiPartnerFingerprint(SALT, stored));
    expect(fp).toMatch(/^fp:[0-9a-f]{32}$/);
    const missing = await createChemiProfileHandlers(d).deletePartner(json("DELETE", { partnerId: PARTNER }));
    expect(missing.status).toBe(404);
    expect((await createChemiProfileHandlers(d).deletePartner(json("DELETE", { partnerId: "nope" }))).status).toBe(400);
    for (const old of ["chemi_add_partner", "chemi_delete_partner"]) expect(d.rpc).not.toHaveBeenCalledWith(old, expect.anything());
  });

  it("fingerprints ignore place and nickname but change with birth input", () => {
    const salt = "01".repeat(32); const base = { birthDate: "1997-03-12", calendar: "solar", birthTime: "08:10", timePrecision: "band", gender: "male" };
    expect(chemiPartnerFingerprint(salt, { ...base, nickname: "x", birthPlaceCode: "kr:11" } as typeof base)).toBe(chemiPartnerFingerprint(salt, base));
    expect(chemiPartnerFingerprint(salt, { ...base, birthDate: "1997-03-13" })).not.toBe(chemiPartnerFingerprint(salt, base));
    expect(chemiPartnerFingerprint("02".repeat(32), base)).not.toBe(chemiPartnerFingerprint(salt, base));
    expect(() => chemiPartnerFingerprint("short", base)).toThrow();
  });

  it("maps a restricted account to 403", async () => {
    const response = await createChemiProfileHandlers(deps(async () => { throw new Error("CHEMI_ACCOUNT_RESTRICTED"); })).putBirth(json("PUT", birth));
    expect([response.status, await response.json()]).toEqual([403, { error: { code: "CHEMI_ACCOUNT_RESTRICTED" } }]);
  });
});
