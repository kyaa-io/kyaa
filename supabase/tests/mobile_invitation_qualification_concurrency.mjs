// Run only against a disposable latest-chain database.
// INVITATION_DISPOSABLE_DB_URL=... node supabase/tests/mobile_invitation_qualification_concurrency.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const database = process.env.INVITATION_DISPOSABLE_DB_URL;
if (!database) throw new Error("INVITATION_DISPOSABLE_DB_URL must name the disposable test database");
const parsed = new URL(database);
const socket = parsed.searchParams.get("host") || process.env.PGHOST || parsed.hostname;
const port = parsed.searchParams.get("port") || parsed.port || process.env.PGPORT;
if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || decodeURIComponent(parsed.pathname) !== "/byus_clean"
  || !socket.startsWith("/") || !/(?:^|\/)byus-clean-db\.[^/]+\/socket\/?$/.test(socket)
  || !port || !/^\d{2,5}$/.test(port) || Number(port) > 65535
  || [...parsed.searchParams.keys()].some(key => !["host", "port"].includes(key) || parsed.searchParams.getAll(key).length !== 1)
  || process.env.PGHOSTADDR || process.env.PGSERVICE) {
  throw new Error("Race harness requires byus_clean on a private byus-clean-db.*/socket with an explicit local port");
}
const psql = process.env.PSQL_BIN || "psql";
const args = [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
function sql(source) {
  try { return execFileSync(psql, args, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch (error) { throw new Error(`Disposable database assertion query failed: ${String(error.stderr || "psql exited without stderr").trim().slice(0, 1500)}`); }
}
function execute(source, applicationName) {
  const child = spawn(psql, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PGAPPNAME: applicationName } });
  let stderr = "";
  child.stderr.on("data", bytes => { stderr = (stderr + bytes).slice(0, 1500); });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${applicationName} failed (${code}): ${stderr}`)));
  });
  child.stdin.end(source);
  return done;
}

const inviter = randomUUID(), invitee = randomUUID();
const creators = [randomUUID(), randomUUID()];
const quizzes = [randomUUID(), randomUUID()];
const attempts = [randomUUID(), randomUUID()];
const passes = [randomUUID(), randomUUID()];
const inviterWallet = `0x${inviter.replaceAll("-", "")}00000000`;
const inviteeWallet = `0x${invitee.replaceAll("-", "")}00000000`;
sql(`begin;
insert into public.app_users(id,privy_user_id,verified_email) values
  ('${inviter}','did:privy:invite-race-${inviter}','${inviter}@example.test'),
  ('${invitee}','did:privy:invite-race-${invitee}','${invitee}@example.test');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values
  ('${inviter}',91342,'${inviterWallet}','privy','embedded'),
  ('${invitee}',91342,'${inviteeWallet}','privy','embedded');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('${creators[0]}','invite-race-${creators[0]}','draft','/qa.webp',null,'{artist}','idol'),
  ('${creators[1]}','invite-race-${creators[1]}','draft','/qa.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('${creators[0]}','ko','초대 경합 1','초대 경합 검증','초대 경합 1'),
  ('${creators[0]}','en','Invite race 1','Invitation race verification','Invite race 1'),
  ('${creators[1]}','ko','초대 경합 2','초대 경합 검증','초대 경합 2'),
  ('${creators[1]}','en','Invite race 2','Invitation race verification','Invite race 2');
update public.celebrities set status='published',published_at=now()
  where id in ('${creators[0]}','${creators[1]}');
insert into public.celebrity_quizzes(id,celebrity_id,version,status) values
  ('${quizzes[0]}','${creators[0]}',1,'draft'),('${quizzes[1]}','${creators[1]}',1,'draft');
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
  ('${attempts[0]}','${invitee}','${creators[0]}','${quizzes[0]}',1,'${attempts[0]}','passed',3,now()),
  ('${attempts[1]}','${invitee}','${creators[1]}','${quizzes[1]}',1,'${attempts[1]}','passed',3,now());
commit;`);
const code = sql(`select public.get_community_stamp_invite_code('${inviter}')->>'code';`);
assert.equal(sql(`select public.redeem_community_stamp_invite('${invitee}','${code}')->>'state';`), "registered_pending_fan_verification");

await Promise.all(passes.map((pass, index) => execute(
  `set statement_timeout='8s'; insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
   values('${pass}','${invitee}','${creators[index]}','${attempts[index]}');`,
  `invitation-first-certification-${index}`,
)));

assert.equal(sql(`select count(*) from public.quiz_passes where app_user_id='${invitee}';`), "2");
assert.equal(sql(`select count(*) from public.community_stamp_invitation_relations
  where invitee_app_user_id='${invitee}' and status='qualified' and qualified_sequence=1;`), "1");
assert.equal(sql(`select count(*) from public.community_stamps
  where kind='invite' and app_user_id in ('${inviter}','${invitee}');`), "2");
console.log("PASS: concurrent first certifications qualify one relationship and issue each invite Stamp once");
