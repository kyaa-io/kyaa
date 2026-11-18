import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDeleteAccountHandler, type AccountDeletionDependencies } from "./account-deletion";

// 실제 탈퇴 RPC(service_role)로 처리기를 끝까지 돌린다(r4b §6.3 #1~#3, Q2 조건 ③). 명시적으로 켤 때만, 일회용 DB 에서만:
//   CHEMI_LOCAL_TEST_DB='host=/tmp/... port=... dbname=byus_clean' (dbname 이 byus_clean·byus_chemi* 일 때만)
// 저장소·provider 삭제는 가짜(성공)로 둔다. CHEMI_TAB 은 끈 채로 돈다(탈퇴는 탭을 보지 않는다).
const db = process.env.CHEMI_LOCAL_TEST_DB;

it.skipIf(!db)("chemi wrappers keep a no-chemi member's deletion identical and erase a chemi member with the tab off", async () => {
  if (!/\bdbname=(byus_clean|byus_chemi\w*)\b/.test(db!)) throw Error("disposable local DB only");
  delete process.env.CHEMI_TAB;
  const sql = (query: string) => execFileSync("psql", [db!, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
  const literal = (v: unknown) => v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`;
  const rpcAs = (rename: (name: string) => string) => async (name: string, args: Record<string, unknown>) => {
    const target = rename(name);
    if (!/^[a-z0-9_]+$/.test(target)) throw Error("unexpected rpc");
    const call = Object.entries(args).map(([key, value]) => `${key} => ${literal(value)}`).join(", ");
    const out = sql(`set role service_role; select public.${target}(${call})`);
    return out === "" ? null : out === "t" ? true : out === "f" ? false : JSON.parse(out);
  };
  const deps = (subject: string, rename: (name: string) => string): AccountDeletionDependencies => ({
    verifySubject: async () => subject, rpc: rpcAs(rename), removeObject: async () => {}, deleteProviderUser: async () => {},
  });
  const request = () => new Request("https://byus.test/api/me/account", {
    method: "DELETE", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body: '{"confirmation":"DELETE"}',
  });
  // 연결 전 코드 흉내: 감싸개 이름을 기존 함수 이름으로 되돌린다(= 되돌리기 커밋의 동작)
  const legacy = (name: string) => ({ chemi_begin_account_deletion: "begin_owned_account_deletion", chemi_complete_account_deletion: "complete_account_deletion" })[name] ?? name;
  const current = (name: string) => name;
  const state = (id: string) => sql(`select concat_ws('|', u.status, u.privy_user_id = 'deleted:' || u.id, u.verified_email = u.id || '@deleted.invalid',
      r.status, r.completed_at is not null, r.lease_token is null, r.provider_subject is null,
      (select count(*) from public.account_subject_tombstones t where t.app_user_id = u.id))
    from public.app_users u left join public.account_deletion_requests r on r.app_user_id = u.id where u.id = '${id}'`);
  const chemiRows = (id: string) => sql(`select (select count(*) from public.chemi_profiles where user_id='${id}') + (select count(*) from public.chemi_readings where user_id='${id}')
    + (select count(*) from public.chemi_daily_uses where user_id='${id}') + (select count(*) from public.chemi_pass_lots where user_id='${id}')
    + (select count(*) from public.chemi_user_state where user_id='${id}')`);
  const member = (withChemi: boolean) => {
    const id = randomUUID(); const subject = `did:privy:chemi-del-${id}`;
    sql(`insert into public.app_users(id,privy_user_id,verified_email) values('${id}','${subject}','${id}@example.invalid')`);
    if (withChemi) sql(`insert into public.chemi_profiles(user_id,birth_date,calendar,time_precision,consent_version,consent_at) values('${id}','1995-05-05','solar','unknown','v1',now());
      insert into public.chemi_readings(id,user_id,content,kind,character,kst_date,result,engine_version,table_version) values('${id}','${id}','fortune','daily','changha',public.dukjil_kst_date(),'{}','e','t');
      insert into public.chemi_daily_uses(user_id,kst_date,bucket,seq,item_key,reading_id) values('${id}',public.dukjil_kst_date(),'open:fortune',1,'daily:x','${id}');
      select public.chemi_pass_ensure_initial('${id}'); insert into public.chemi_user_state(user_id) values('${id}')`);
    return { id, subject };
  };

  // #1 케미 줄 없는 회원: 연결 전·후 코드의 응답과 끝 상태가 같다
  const before = member(false); const after = member(false);
  const r1 = await createDeleteAccountHandler(deps(before.subject, legacy))(request());
  const r2 = await createDeleteAccountHandler(deps(after.subject, current))(request());
  expect([r1.status, await r1.json()]).toEqual([200, { deletion: { status: "completed" } }]);
  expect([r2.status, await r2.json()]).toEqual([200, { deletion: { status: "completed" } }]);
  expect(state(after.id)).toBe(state(before.id));
  expect(state(after.id)).toBe("disabled|t|t|completed|t|t|t|1");
  expect(chemiRows(after.id)).toBe("0");

  // #2·#3 케미 줄이 있는 회원, CHEMI_TAB 꺼짐: 처리기 경로로 끝까지 → 케미 줄 0
  const chemi = member(true);
  expect(chemiRows(chemi.id)).not.toBe("0");
  const r3 = await createDeleteAccountHandler(deps(chemi.subject, current))(request());
  expect([r3.status, await r3.json()]).toEqual([200, { deletion: { status: "completed" } }]);
  expect(state(chemi.id)).toBe("disabled|t|t|completed|t|t|t|1");
  expect(chemiRows(chemi.id)).toBe("0");
  // 연결 전 코드였다면 케미 줄이 남는다(감싸개가 하는 일의 대조군)
  const legacyChemi = member(true);
  await createDeleteAccountHandler(deps(legacyChemi.subject, legacy))(request());
  expect(chemiRows(legacyChemi.id)).not.toBe("0");
});
