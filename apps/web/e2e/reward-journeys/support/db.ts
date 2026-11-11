import { execFileSync } from "node:child_process";
import { assertLocalOnly, PG } from "./env";

function run(sql: string): string {
  assertLocalOnly();
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", PG.host, "-p", PG.port, "-U", PG.user, "-d", PG.database, "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  }).trim();
}

/** One value (first column of the first row). */
export const scalar = (sql: string): string => run(sql).split("\n")[0] ?? "";
export const count = (sql: string): number => Number(scalar(sql) || 0);
export const exec = (sql: string): void => void run(sql);

const uuid = (value: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`NOT_A_UUID: ${value}`);
  return value;
};

export function appUserIdByEmail(email: string): string {
  const id = scalar(`select id from app_users where verified_email = '${email.replace(/'/g, "''").toLowerCase()}'`);
  if (!id) throw new Error(`REWARD_E2E_MEMBER_MISSING: log ${email} in once on the app so the member row exists`);
  return uuid(id);
}

// Rows keyed by the member. The ledgers are append-only for the app, so a reset has to bypass their triggers: the session
// replication role is set for this one transaction only, and only the test member's rows are touched.
const MEMBER_TABLES = [
  "mobile_fan_economy_ledger", "fan_ticket_ledger", "group_wallet_receipts", "group_wallet_ad_sessions", "passport_claim_ad_sessions", "group_wallet_attendance",
  "group_wallet_owner_sequences", "group_creator_attendance", "community_stamps", "creator_heart_ledger", "jjinfan_titles",
  "dukjil_action_log", "dukjil_point_corrections", "dukjil_wire_failures", "dukjil_pending_content_corrections", "fan_score_ledger",
  "fan_program_stamps", "fan_ticket_activity_awards", "benefit_ticket_entries", "fan_heart_conversions", "first_reaction_stamps",
  "group_raffle_entries",
] as const;

/** Back to an empty reward history for one member. The passport and the account stay. */
export function resetMember(appUserId: string): void {
  const id = uuid(appUserId);
  const deletes = MEMBER_TABLES.map((table) => `delete from public.${table} where app_user_id = '${id}';`).join("\n");
  run(`begin;
set local session_replication_role = replica;
update public.passport_page_slots set stamp_id = null, assigned_at = null, cleared_at = null
  where passport_id in (select id from public.fan_passports where app_user_id = '${id}');
delete from public.passport_page_claims where passport_id in (select id from public.fan_passports where app_user_id = '${id}');
${deletes}
commit;`);
}

export const balances = (appUserId: string) => ({
  points: Number(scalar(`select public.group_wallet_balance('${uuid(appUserId)}', 'fan_point')`)),
  tickets: Number(scalar(`select public.group_wallet_balance('${uuid(appUserId)}', 'ticket')`)),
});
