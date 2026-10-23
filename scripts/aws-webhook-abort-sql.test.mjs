import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sql = await readFile(new URL('../infrastructure/aws/database/webhook-abort-replay.sql', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../supabase/migrations/20261130002000_webhook_intake.sql', import.meta.url), 'utf8');
const pgBin = '/opt/homebrew/opt/postgresql@17/bin';
const env = { ...process.env, PATH: `${pgBin}:${process.env.PATH}` };
for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
const available = spawnSync('pg_config', ['--version'], { env, encoding: 'utf8' });
const hash = 'a'.repeat(64);
const command = JSON.stringify([{ name: 'record_kakao_notification_receipt', args: { p_delivery_id: '00000000-0000-0000-0000-000000000001', p_provider_message_id: 'ok', p_group_id: 'synthetic' } }]);
const literal = value => `'${value.replaceAll("'", "''")}'`;
const replay = (event = 'event', commands = command, run = 'run') => `select _byus_migration.replay_aborted_webhook(${literal(run)},'solapi',${literal(event)},'${hash}',${literal(commands)}::jsonb);`;

test('abort wrapper preserves the canonical allowlist, casts, batch and Telegram implementation', () => {
  const body = canonical.slice(canonical.indexOf(' expected:='), canonical.indexOf('end $$;')).replaceAll('public.webhook_intake_inbox', '_byus_migration.webhook_abort_inbox');
  assert(sql.includes(body));
  assert.doesNotMatch(sql, /create (?:or replace|schema|role)|security definer|grant\s/i);
});

test('disposable PostgreSQL 17 enforces atomic owner-only abort replay and fence leases', { skip: !/^PostgreSQL 17\./.test(available.stdout ?? ''), timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'byus-webhook-abort-'));
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  env.PGPORT = String(listener.address().port); env.PGHOST = '127.0.0.1';
  await new Promise(resolve => listener.close(resolve));
  const run = (bin, args) => {
    const result = spawnSync(bin, args, { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const args = user => ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-U', user, '-d', 'fixture'];
  const query = (text, user = 'postgres') => {
    const result = spawnSync('psql', args(user), { env, input: text, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const rejects = (text, pattern, user = 'postgres') => {
    const result = spawnSync('psql', args(user), { env, input: text, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, pattern);
  };
  const holders = new Set();
  const hold = async text => {
    const child = spawn('psql', args('postgres'), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    holders.add(child);
    await new Promise((resolve, reject) => {
      let output = ''; let errors = '';
      const timeout = setTimeout(() => reject(new Error('Synthetic lease holder did not become ready')), 3000);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error(errors || 'Lease holder exited')); });
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('lease-ready')) { clearTimeout(timeout); resolve(); } });
      child.stdin.write(`begin; ${text} select 'lease-ready';\n`);
    });
    return async () => {
      await new Promise(resolve => { child.once('exit', resolve); child.stdin.end('rollback;\n'); });
      holders.delete(child);
    };
  };
  let started = false;
  try {
    run('initdb', ['-D', join(dir, 'pg'), '-A', 'trust', '--no-locale', '-E', 'UTF8', '-U', 'fixture_admin']);
    run('pg_ctl', ['-D', join(dir, 'pg'), '-l', join(dir, 'server.log'), '-o', `-h127.0.0.1 -p${env.PGPORT}`, '-w', 'start']); started = true;
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-U', 'fixture_admin', '-d', 'postgres', '-c', 'create role postgres login; create role anon; create role authenticated; create role service_role login;']);
    run('createdb', ['-U', 'fixture_admin', '-O', 'postgres', 'fixture']);
    query(`create schema extensions; create extension pgcrypto with schema extensions; create schema _byus_migration;
      revoke all on schema _byus_migration from public;
      create table _byus_migration.auth_fence(singleton boolean primary key check(singleton),run_id text not null,fenced boolean not null);
      create table _byus_migration.storage_fence(like _byus_migration.auth_fence including all);
      insert into _byus_migration.auth_fence values(true,'run',false); insert into _byus_migration.storage_fence values(true,'run',false);
      create table public.effects(id bigint generated always as identity, value text);
      create function public.record_kakao_notification_receipt(uuid,text,text) returns void language plpgsql as $$ begin if $2='fail' then raise exception 'synthetic failure'; end if; insert into public.effects(value) values($2); end $$;
      create table public.telegram_bug_reports(telegram_chat_id bigint,telegram_message_id bigint,telegram_update_id bigint,primary key(telegram_chat_id,telegram_message_id));
      create function public.ingest_telegram_bug_report(bigint,bigint,bigint,text,timestamptz,timestamptz,jsonb,text,jsonb,bigint) returns void language sql as $$ insert into public.telegram_bug_reports values($3,$2,$1) on conflict(telegram_chat_id,telegram_message_id) do update set telegram_update_id=excluded.telegram_update_id; $$;`);
    const aclBefore = query("select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='_byus_migration';");
    query(sql);
    assert.equal(query("select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='_byus_migration';"), aclBefore);
    query(`insert into _byus_migration.webhook_replay_control values('run','prepared-cancel-complete','${hash}',default);`);

    await t.test('prepared cancel supports absent state, then aborted requires exact current source row', () => {
      assert.equal(query(replay()), 't'); assert.equal(query(replay()), 'f');
      query("update _byus_migration.webhook_replay_control set mode='aborted';");
      rejects(replay('missing-state'), /P0001/);
      query("create table _byus_migration.state(run_id text primary key,side text not null,fenced boolean not null); insert into _byus_migration.state values('run','source',false);");
      assert.equal(query(replay('aborted')), 't');
    });
    await t.test('batch failure rolls back both all effects and inbox; duplicate command conflict is atomic', () => {
      const before = query('select count(*) from public.effects;');
      const batch = JSON.parse(command); batch.push({ ...batch[0], args: { ...batch[0].args, p_provider_message_id: 'fail' } });
      rejects(replay('failed-batch', JSON.stringify(batch)), /P0001/);
      assert.equal(query('select count(*) from public.effects;'), before);
      assert.equal(query("select count(*) from _byus_migration.webhook_abort_inbox where event_key='failed-batch';"), '0');
      rejects(replay('aborted', command.replace('ok', 'changed')), /P0001/);
      assert.equal(query('select count(*) from public.effects;'), before);
      rejects(replay('invalid', command.replace('record_kakao_notification_receipt', 'arbitrary_function')), /P0001/);
      rejects(replay('bad-type', command.replace('00000000-0000-0000-0000-000000000001', 'invalid')), /22P02/);
    });
    await t.test('each missing, mismatched or true fence and hold mode fails closed', () => {
      for (const table of ['auth_fence', 'storage_fence']) {
        rejects(`begin; update _byus_migration.${table} set fenced=true; ${replay()} rollback;`, /P0001/);
        rejects(`begin; update _byus_migration.${table} set run_id='old'; ${replay()} rollback;`, /P0001/);
        rejects(`begin; delete from _byus_migration.${table}; ${replay()} rollback;`, /P0001/);
      }
      for (const mutation of ["update _byus_migration.state set fenced=true", "update _byus_migration.state set side='target'", 'delete from _byus_migration.state', "update _byus_migration.webhook_replay_control set mode='hold'", 'delete from _byus_migration.webhook_replay_control']) rejects(`begin; ${mutation}; ${replay()} rollback;`, /P0001/);
      rejects(`begin isolation level repeatable read; ${replay()} rollback;`, /P0001/);
      rejects(replay('old-run', command, 'old'), /P0001/);
    });
    await t.test('prepared cancel rejects current state, live old fences, guard and barrier', () => {
      query("update _byus_migration.webhook_replay_control set mode='prepared-cancel-complete';");
      rejects(replay(), /P0001/);
      query("update _byus_migration.state set run_id='old';");
      assert.equal(query(replay('prepared-old-false')), 't');
      rejects(`begin; update _byus_migration.state set fenced=true; ${replay()} rollback;`, /P0001/);
      query("create function public.synthetic_guard() returns trigger language plpgsql as $$ begin return null; end $$; create trigger byus_migration_guard before insert on public.effects for each statement execute function public.synthetic_guard();");
      rejects(replay(), /P0001/); query('drop trigger byus_migration_guard on public.effects;');
      query('create schema _byus_barrier; create table _byus_barrier.barriers(id int); insert into _byus_barrier.barriers values(1);');
      rejects(replay(), /P0001/); query('delete from _byus_barrier.barriers;');
      assert.equal(query(replay('prepared-empty-barrier')), 't');
      query("update _byus_migration.state set run_id='run'; update _byus_migration.webhook_replay_control set mode='aborted';");
    });
    await t.test('Telegram stale redelivery preserves the newest message update', () => {
      const telegram = update => `select _byus_migration.replay_aborted_webhook('run','telegram','telegram-${update}','${hash}',${literal(JSON.stringify([{ name: 'ingest_telegram_bug_report', args: { p_telegram_chat_id: '1', p_telegram_message_id: '2', p_telegram_update_id: String(update), p_update_kind: 'message' } }]))}::jsonb);`;
      assert.equal(query(telegram(20)), 't'); assert.equal(query(telegram(10)), 't');
      assert.equal(query('select telegram_update_id from public.telegram_bug_reports;'), '20');
    });
    await t.test('replay leases block all three fence updates and authorization changes through transaction end', async () => {
      const release = await hold(replay('lease'));
      try {
        for (const table of ['auth_fence', 'state', 'storage_fence']) rejects(`set lock_timeout='150ms'; update _byus_migration.${table} set fenced=true;`, /55P03/);
        rejects("set lock_timeout='150ms'; update _byus_migration.webhook_replay_control set mode='hold';", /55P03/);
      } finally { await release(); }
      for (const table of ['auth_fence', 'state', 'storage_fence']) {
        const unlock = await hold(`update _byus_migration.${table} set fenced=true;`);
        try { rejects(`set lock_timeout='150ms'; ${replay('waiting')}`, /55P03/); } finally { await unlock(); }
      }
    });
    await t.test('owner, invoker identity, private ACL and non-overwriting installation are enforced', () => {
      assert.equal(query("select not prosecdef and proowner='postgres'::regrole and proconfig=array['search_path=\"\"'] from pg_proc where oid='_byus_migration.replay_aborted_webhook(text,text,text,text,jsonb)'::regprocedure;"), 't');
      assert.equal(query("select bool_and(not has_function_privilege(r,'_byus_migration.replay_aborted_webhook(text,text,text,text,jsonb)','execute') and not has_table_privilege(r,'_byus_migration.webhook_abort_inbox','select,insert,update,delete') and not has_table_privilege(r,'_byus_migration.webhook_replay_control','select,insert,update,delete')) from unnest(array['anon','authenticated','service_role']) r;"), 't');
      query("grant usage on schema _byus_migration to service_role; grant execute on function _byus_migration.replay_aborted_webhook(text,text,text,text,jsonb) to service_role;");
      rejects(replay(), /P0001/, 'service_role');
      query(`create function public.synthetic_elevation() returns boolean language sql security definer as $$ ${replay()} $$;`);
      rejects('select public.synthetic_elevation();', /P0001/, 'service_role');
      rejects(`begin; alter schema _byus_migration rename to synthetic_hidden; ${sql}`, /P0001/);
      query('alter schema _byus_migration owner to fixture_admin;', 'fixture_admin');
      try { rejects(sql, /P0001/); } finally { query('alter schema _byus_migration owner to postgres;', 'fixture_admin'); }
      rejects(`begin; drop function _byus_migration.replay_aborted_webhook(text,text,text,text,jsonb); drop table _byus_migration.webhook_abort_inbox,_byus_migration.webhook_replay_control; alter default privileges grant select on tables to fixture_admin; ${sql}`, /P0001/);
      rejects(sql, /42P07/);
      assert.equal(query("select count(*)>0 from _byus_migration.webhook_abort_inbox;"), 't');
    });
  } finally {
    for (const child of holders) child.kill('SIGTERM');
    if (started) run('pg_ctl', ['-D', join(dir, 'pg'), '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  }
});
