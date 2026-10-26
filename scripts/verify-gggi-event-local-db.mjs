// Uses a fresh disposable PostgreSQL cluster and never reads production credentials.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('..', import.meta.url);
const cluster = await mkdtemp(join(tmpdir(), 'byus-gggi-event-'));
const data = join(cluster, 'data');
const log = join(cluster, 'postgres.log');
const socket = join(cluster, 'socket');
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const postgres = `postgresql://127.0.0.1:${port}/postgres`;

function command(name, args, options = {}) {
  const result = spawnSync(name, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${name} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sql(input, allowError = false) {
  const result = spawnSync('psql', [postgres, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input,
    encoding: 'utf8',
  });
  if (!allowError && result.status !== 0) throw new Error(result.stderr);
  return allowError ? result : result.stdout.trim();
}

function parallel(input) {
  return new Promise((resolve) => {
    const child = spawn('psql', [postgres, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(input);
  });
}

function check(value, message) {
  if (!value) throw new Error(message);
}

let started = false;
try {
  command('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8']);
  command('mkdir', ['-p', socket]);
  command('pg_ctl', ['-D', data, '-l', log, '-o', `-h 127.0.0.1 -p ${port} -k ${socket}`, 'start']);
  started = true;

  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table public.app_users(id uuid primary key,status text,verified_email text);
    create type public.admin_role as enum('viewer','operator','super_admin');
    create table public.admin_allowlist(id uuid primary key,email text,active boolean,role public.admin_role);
    create table public.app_user_moderation_restrictions(app_user_id uuid,revoked_at timestamptz);
    create table public.celebrities(id uuid primary key,slug text unique,status text,archived_at timestamptz);
    create table public.fan_reactions(app_user_id uuid references public.app_users(id),celebrity_id uuid references public.celebrities(id),business_status text);
    insert into public.app_users
      select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'active','user'||n||'@example.test' from generate_series(1,5) n;
    insert into public.app_users values('00000000-0000-0000-0000-000000000006','deleted','deleted@example.test');
    insert into public.celebrities values
      ('10000000-0000-0000-0000-000000000001','gggi','published',null),
      ('10000000-0000-0000-0000-000000000002','other','published',null);
    insert into public.admin_allowlist values('20000000-0000-0000-0000-000000000001','user5@example.test',true,'viewer');
  `);
  // Execute the real guards, including the current moderation wrapper, against focused fixture tables.
  async function loadFunction(file, name) {
    const source = await readFile(new URL(`supabase/migrations/${file}`, repo), 'utf8');
    const start = source.indexOf(`create function public.${name}(`);
    check(start >= 0, `${name} must exist in the migration`);
    const end = source.indexOf('$$;', start);
    sql(source.slice(start, end + 3));
  }
  await loadFunction('20260926010000_fan_web_foundation.sql', 'fan_web_lock_active_user');
  sql('alter function public.fan_web_lock_active_user(uuid) rename to fan_web_lock_active_user_before_moderation;');
  await loadFunction('20261129010000_ugc_moderation.sql', 'fan_web_lock_active_user');
  await loadFunction('20260721087500_g5_benefit_cms.sql', 'assert_active_admin');
  sql(await readFile(new URL('supabase/migrations/20261130003000_gggi_event_entry.sql', repo), 'utf8'));
  const user = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const enter = n => `set role service_role; select public.enter_gggi_event('${user(n)}');`;
  const read = n => `set role service_role; select public.read_gggi_event(${n ? `'${user(n)}'` : 'null'});`;
  function denied(input, message) {
    const result = sql(input, true);
    check(result.status !== 0 && result.stderr.includes(message), `expected ${message}: ${result.stderr || result.stdout}`);
  }
  const initial = JSON.parse(sql(read(null)));
  check(initial.status === 'draft' && initial.participation === null, 'default is draft with no anonymous owner');
  denied(enter(1), 'GGGI_EVENT_CLOSED');
  sql("update public.gggi_event_config set status='open';");
  denied(enter(1), 'GGGI_EVENT_LIKE_REQUIRED');
  sql(`insert into public.fan_reactions values('${user(1)}','10000000-0000-0000-0000-000000000002','completed');`);
  denied(enter(1), 'GGGI_EVENT_LIKE_REQUIRED');
  sql(`insert into public.fan_reactions values('${user(1)}','10000000-0000-0000-0000-000000000001','pending');`);
  denied(enter(1), 'GGGI_EVENT_LIKE_REQUIRED');
  check(sql('select count(*) from public.gggi_event_entries;') === '0', 'rejected entry creates no ledger row');
  sql(`update public.fan_reactions set business_status='completed' where app_user_id='${user(1)}';`);
  const responses = await Promise.all(Array.from({ length: 8 }, () => parallel(enter(1))));
  check(responses.every(r => r.code === 0), `concurrent requests succeed: ${JSON.stringify(responses)}`);
  const timestamps = responses.map(r => JSON.parse(r.stdout).participation.enteredAt);
  check(new Set(timestamps).size === 1 && timestamps[0], 'concurrent retries preserve the first timestamp');
  check(sql('select count(*) from public.gggi_event_entries;') === '1', 'one entry per account');
  check(JSON.parse(sql(read(1))).participation.enteredAt === timestamps[0], 'owner read reports original timestamp');
  sql("update public.gggi_event_config set status='closed';");
  check(JSON.parse(sql(enter(1))).participation.enteredAt === timestamps[0], 'closed replay returns original entry');
  denied(enter(2), 'GGGI_EVENT_CLOSED');
  sql("update public.gggi_event_config set status='draft';");
  check(JSON.parse(sql(enter(1))).participation.enteredAt === timestamps[0], 'draft replay returns original entry');
  denied(enter(2), 'GGGI_EVENT_CLOSED');
  sql("update public.gggi_event_config set status='open';");
  denied(enter(6), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  denied(read(6), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  denied(enter(99), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  denied('select public.enter_gggi_event(null);', 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  sql(`insert into public.app_user_moderation_restrictions values('${user(1)}',null);`);
  denied(enter(1), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  denied(read(1), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  sql('delete from public.app_user_moderation_restrictions;');
  sql(`update public.app_users set status='deleted' where id='${user(1)}';`);
  denied(enter(1), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  sql(`update public.app_users set status='active' where id='${user(1)}';
    insert into public.fan_reactions values('${user(2)}','10000000-0000-0000-0000-000000000001','completed');
    update public.celebrities set status='draft' where slug='gggi';`);
  denied(enter(2), 'GGGI_EVENT_NOT_FOUND');
  denied(read(null), 'GGGI_EVENT_NOT_FOUND');
  check(JSON.parse(sql(enter(1))).participation.enteredAt === timestamps[0], 'existing entry remains idempotent when creator unpublished');
  sql("update public.celebrities set status='published',archived_at=clock_timestamp() where slug='gggi';");
  denied(enter(2), 'GGGI_EVENT_NOT_FOUND');
  denied(read(2), 'GGGI_EVENT_NOT_FOUND');
  sql("update public.celebrities set archived_at=null where slug='gggi';");
  sql(enter(2));
  const admin = (owner = 5, offset = 0, limit = 1) => `set role service_role; select public.read_admin_gggi_event_entries('${user(owner)}','20000000-0000-0000-0000-000000000001',${offset},${limit});`;
  denied(admin(1), 'active admin required');
  const page = JSON.parse(sql(admin()));
  check(page.total === 2 && page.entries.length === 1 && page.nextOffset === 1, 'authorized viewer reads bounded ledger');
  const page2 = JSON.parse(sql(admin(5, 1)));
  check(page2.entries[0].appUserId !== page.entries[0].appUserId && page2.nextOffset === null, 'stable pagination has no duplicate');
  denied(admin(5, 0, 101), 'FANPAGE_INVALID_REQUEST');
  denied(admin(5, -1), 'FANPAGE_INVALID_REQUEST');
  sql("update public.admin_allowlist set active=false;");
  denied(admin(), 'active admin required');
  sql("update public.admin_allowlist set active=true;");
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const table of ['gggi_event_config', 'gggi_event_entries']) {
      for (const verb of ['select', 'insert', 'update', 'delete', 'truncate']) {
        check(sql(`select has_table_privilege('${role}','public.${table}','${verb}');`) === 'f', `${role} has no direct ${verb} on ${table}`);
      }
      denied(`set role ${role}; select * from public.${table};`, 'permission denied');
      check(sql(`select relrowsecurity and relforcerowsecurity from pg_class where oid='public.${table}'::regclass;`) === 't', `${table} forces RLS`);
    }
    check(sql(`select has_function_privilege('${role}','public.gggi_event_json(uuid)','execute');`) === 'f', 'internal helper cannot be called directly');
    for (const fn of ['read_gggi_event(uuid)', 'enter_gggi_event(uuid)', 'read_admin_gggi_event_entries(uuid,uuid,integer,integer)']) {
      check(sql(`select has_function_privilege('${role}','public.${fn}','execute');`) === (role === 'service_role' ? 't' : 'f'), `${role} RPC execute is correctly scoped`);
    }
  }
  denied("set role anon; select public.read_gggi_event(null);", 'permission denied');
  denied(`set role authenticated; select public.enter_gggi_event('${user(1)}');`, 'permission denied');
  check(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('gggi_event_json','read_gggi_event','enter_gggi_event','read_admin_gggi_event_entries') and p.prosecdef and p.proconfig=array['search_path=\"\"'];") === '4', 'all RPCs use security definer with an empty search path');
  console.log('PASS: default draft, explicit completed GGGI like, no auto-like, concurrent one/account and stable first timestamp, closed/draft replay, inactive/missing/moderated owner, unpublished/archived creator, admin authorization and pagination, service-only RPCs, table ACL and forced RLS.');
  console.log(`PostgreSQL log: ${log}`);
} finally {
  if (started) command('pg_ctl', ['-D', data, 'stop', '-m', 'fast']);
}
