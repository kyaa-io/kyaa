import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
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
    if (!/^chemi_[a-z_]+$/.test(name)) throw Error("unexpected rpc");
    const call = Object.entries(args).map(([key, value]) => `${key} => ${literal(value)}`).join(", ");
    try { return JSON.parse(sql(`select public.${name}(${call})`)); }
    catch (error) { throw new Error(String((error as { stderr?: string }).stderr ?? "").match(/ERROR:\s+(\S+)/)?.[1] ?? "SQL_FAILED"); }
  };
  const user = randomUUID();
  sql(`insert into public.app_users(id,privy_user_id,verified_email) values('${user}','did:privy:chemi-profile-${user}','${user}@example.invalid')`);
  const h = createChemiProfileHandlers({ rpc, authorize: async () => ({ appUserId: user }) });
  const call = (run: (r: Request) => Promise<Response>, method: string, body?: unknown) =>
    run(new Request("http://localhost/api/chemi/x", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));

  // 빈 상태: 생일·상대 없음
  const empty = await call(h.getProfile, "GET");
  expect([empty.status, await empty.json()]).toEqual([200, { birth: null, consent: null, partners: [], partnerLimit: 10 }]);
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
  // 동의 철회: 지운 것 요약, 다시 빈 상태
  const erased = await call(h.deleteBirth, "DELETE");
  expect([erased.status, (await erased.json()).erased.profile]).toEqual([200, 1]);
  expect(await (await call(h.getProfile, "GET")).json()).toEqual({ birth: null, consent: null, partners: [], partnerLimit: 10 });
  // 시험 계정(app_users 1줄)은 다른 표의 기록이 붙어 지우지 않는다. 일회용 DB 를 지워 정리한다.
});
