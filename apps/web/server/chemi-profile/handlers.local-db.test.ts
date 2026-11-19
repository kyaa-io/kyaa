import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { chemiPartnerFingerprint } from "./fingerprint";
import { createChemiProfileHandlers } from "./handlers";

// 실제 SQL 응답을 라우트 스키마에 통과시키는 시험. 명시적으로 켤 때만 돈다(일회용 DB, 비밀 없음):
//   CHEMI_LOCAL_TEST_DB='host=/tmp/... port=... dbname=byus_clean user=postgres' (dbname 이 byus_clean·byus_chemi* 일 때만)
const db = process.env.CHEMI_LOCAL_TEST_DB;
const original = process.env.CHEMI_TAB;
beforeEach(() => { process.env.CHEMI_TAB = "true"; });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });

it.skipIf(!db)("profile routes run against the real chemi SQL functions, empty state first", async () => {
  if (!/\bdbname=(byus_clean|byus_chemi\w*)\b/.test(db!)) throw Error("disposable local DB only");
  const sql = (query: string) => execFileSync("psql", [db!, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
  const literal = (v: unknown) => v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (!/^chemi_[a-z0-9_]+$/.test(name)) throw Error("unexpected rpc");
    const call = Object.entries(args).map(([key, value]) => `${key} => ${literal(value)}`).join(", ");
    // 라우트와 같은 역할(service_role)로 부른다 — 회수된 옛 함수는 여기서 42501 이 된다.
    try { const out = sql(`set role service_role; select public.${name}(${call})`); return out.startsWith("{") || out.startsWith("[") ? JSON.parse(out) : out; }
    catch (error) { throw new Error(String((error as { stderr?: string }).stderr ?? "").match(/ERROR:\s+(\S+)/)?.[1] ?? "SQL_FAILED"); }
  };
  const user = randomUUID();
  sql(`insert into public.app_users(id,privy_user_id,verified_email) values('${user}','did:privy:chemi-profile-${user}','${user}@example.invalid')`);
  const h = createChemiProfileHandlers({ rpc, authorize: async () => ({ appUserId: user }) });
  const call = (run: (r: Request) => Promise<Response>, method: string, body?: unknown) =>
    run(new Request("http://localhost/api/chemi/x", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));

  // 빈 상태: 생일·상대 없음
  const empty = await call(h.getProfile, "GET");
  expect([empty.status, await empty.json()]).toEqual([200, { birth: null, consent: null, partners: [], partnerLimit: 10, birthMark: null, summary: { readingDays: 0, askThreads: 0, partners: 0, orders: 0, askPassesLeft: 0, sajuReading: false, fortuneToday: false, starToday: false } }]);
  // 만 14세 미만은 저장하지 않는다
  const child = await call(h.putBirth, "PUT", { birthDate: new Date(Date.now() - 10 * 365 * 864e5).toISOString().slice(0, 10), calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null, birthPlace: null, consent: true });
  expect(child.status).toBe(403);
  expect(sql(`select count(*) from public.chemi_profiles where user_id='${user}'`)).toBe("0");
  // 저장 → 같은 값 다시 → 고치기 1번 → 30일 안 두 번째 고치기는 막힘
  const saved = await call(h.putBirth, "PUT", { birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울", consent: true });
  expect([saved.status, await saved.json()]).toEqual([200, { ageBand: "adult", edited: false, editableFrom: null }]);
  expect((await (await call(h.putBirth, "PUT", { birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울", consent: true })).json()).edited).toBe(false);
  const edited = await call(h.putBirth, "PUT", { birthDate: "1995-05-06", calendar: "lunar", birthTime: null, timePrecision: "unknown", gender: null, birthPlace: null, consent: true });
  const editedBody = await edited.json();
  expect([edited.status, editedBody.edited]).toEqual([200, true]);
  const limited = await call(h.putBirth, "PUT", { birthDate: "1995-05-07", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null, birthPlace: null, consent: true });
  const limitedBody = await limited.json();
  expect([limited.status, limitedBody.error.code, limitedBody.error.editableFrom]).toEqual([409, "CHEMI_EDIT_LIMIT", editedBody.editableFrom]);
  // 상대 넣기·읽기·지우기
  const partner = await call(h.postPartner, "POST", { nickname: "민지", birthDate: "1997-03-12", calendar: "solar", birthTime: "08:10", timePrecision: "band", gender: "male", source: "saju" });
  const { partnerId } = await partner.json();
  expect(partner.status).toBe(201);
  const full = await (await call(h.getProfile, "GET")).json();
  expect(full.birth).toMatchObject({ birthDate: "1995-05-06", calendar: "lunar", birthTime: null, timePrecision: "unknown", ageBand: "adult" });
  expect(full.partners).toEqual([expect.objectContaining({ id: partnerId, nickname: "민지", birthTime: "08:10", timePrecision: "band" })]);
  expect((await call(h.deletePartner, "DELETE", { partnerId })).status).toBe(200);
  expect((await call(h.deletePartner, "DELETE", { partnerId })).status).toBe(404);
  // 회수된 옛 프로필 함수는 service_role 로 부를 수 없다(F-B15)
  await expect(rpc("chemi_add_partner", { p_user: user, p_nickname: "x", p_birth_date: "1990-01-01", p_calendar: "solar", p_birth_time: null, p_precision: "unknown", p_gender: null, p_source: "saju" })).rejects.toThrow();
  expect(sql(`select count(*) from public.chemi_partners where user_id='${user}'`)).toBe("0");
  // 동의 철회: 지운 것 요약, 다시 빈 상태
  const erased = await call(h.deleteBirth, "DELETE");
  expect([erased.status, (await erased.json()).erased.profile]).toEqual([200, 1]);
  expect(await (await call(h.getProfile, "GET")).json()).toEqual({ birth: null, consent: null, partners: [], partnerLimit: 10, birthMark: null, summary: { readingDays: 0, askThreads: 0, partners: 0, orders: 0, askPassesLeft: 0, sajuReading: false, fortuneToday: false, starToday: false } });

  // 검토 ISSUE 1: 지문은 SQL(chemi_partner_fp)과 fingerprint.ts 가 같은 값이어야 v3 가 그 줄을 찾는다.
  const birth = { birthDate: "1995-05-05", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null, birthPlace: null, consent: true };
  const stored = { birthDate: "1997-03-12", calendar: "solar", birthTime: "08:10", timePrecision: "band", gender: "male" };
  expect((await call(h.putBirth, "PUT", birth)).status).toBe(200);
  const p2 = (await (await call(h.postPartner, "POST", { nickname: "민지", ...stored, source: "saju" })).json()).partnerId;
  const salt = sql(`select public.chemi_fp_salt('${user}')`);
  const fp = chemiPartnerFingerprint(salt, stored);
  sql(`insert into public.chemi_readings(user_id,content,kind,character,kst_date,target_key,result,engine_version,table_version,opened_by)
    values('${user}','saju','compat','changha',public.dukjil_kst_date(),'${fp}','{}','e','t','free')`);
  expect((await call(h.deletePartner, "DELETE", { partnerId: p2 })).status).toBe(200);
  expect(sql(`select count(*) from public.chemi_readings where user_id='${user}' and target_key='${fp}'`)).toBe("0");

  // 검토 ISSUE 1: 화면이 상대를 본 뒤 생일 철회가 먼저 끝나고, 늦게 온 지우기 → 404, 소금은 비운 채로 남는다.
  const p3 = (await (await call(h.postPartner, "POST", { nickname: "하나", ...stored, source: "saju" })).json()).partnerId;
  expect((await call(h.getProfile, "GET")).status).toBe(200);
  expect((await call(h.deleteBirth, "DELETE")).status).toBe(200);
  expect((await call(h.deletePartner, "DELETE", { partnerId: p3 })).status).toBe(404);
  expect(sql(`select count(*) from public.chemi_user_state where user_id='${user}' and fp_salt is not null`)).toBe("0");
  expect(sql(`select coalesce(public.chemi_fp_salt('${user}'), 'null')`)).toBe("null");
  expect(sql(`select count(*) from public.chemi_user_state where user_id='${user}' and fp_salt is not null`)).toBe("0");

  // 검토 ISSUE 1: 상대를 본 뒤 탈퇴가 완료(묘비)되고, 늦게 온 지우기 → 403, 케미 상태 줄이 다시 생기지 않는다.
  expect((await call(h.putBirth, "PUT", birth)).status).toBe(200);
  const p4 = (await (await call(h.postPartner, "POST", { nickname: "셋", ...stored, source: "saju" })).json()).partnerId;
  sql(`select public.chemi_fp_salt('${user}')`);
  sql(`select public.chemi_begin_account_deletion('did:privy:chemi-profile-${user}')`);
  const lease = sql(`select public.claim_account_deletion('${user}')->>'leaseToken'`);
  expect(sql(`select public.chemi_complete_account_deletion('${user}', '${lease}')`)).toBe("t");
  expect(sql(`select count(*) from public.chemi_user_state where user_id='${user}'`)).toBe("0");
  const late = await call(h.deletePartner, "DELETE", { partnerId: p4 });
  expect([late.status, (await late.json()).error.code]).toEqual([403, "CHEMI_ACCOUNT_CLOSED"]);
  await expect(rpc("chemi_fp_salt", { p_user: user })).rejects.toThrow("CHEMI_ACCOUNT_CLOSED");
  expect(sql(`select count(*) from public.chemi_user_state where user_id='${user}'`)).toBe("0");
  expect(sql(`select count(*) from public.chemi_partners where user_id='${user}'`)).toBe("0");
  // 시험 계정(app_users 1줄)은 다른 표의 기록이 붙어 지우지 않는다. 일회용 DB 를 지워 정리한다.
});
