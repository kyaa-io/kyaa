import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { candidates, drawLocal } from '@/server/signup-event/local';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), refresh: vi.fn(), read: vi.fn() }));
vi.mock('@/server/fanpage/dependencies', () => ({ createFanpageDependencies: () => ({ authorize: mocks.authorize }) }));
vi.mock('@/server/data/client', () => ({ createClient: () => ({}) }));
vi.mock('@/server/config/env', () => ({ loadServerEnv: () => ({}) }));
vi.mock('@/server/signup-event/refresh', () => ({ refreshLocalSignupEvent: mocks.refresh }));
vi.mock('@/server/signup-event/local', async original => ({ ...await original<typeof import('@/server/signup-event/local')>(), readLocalSnapshot: mocks.read }));
vi.mock('@/server/signup-event/database', () => ({
  createSignupRaffleDatabase: () => ({}),
  readSignupRaffleStored: () => ({ users: [], actions: [], entries: [] }),
}));

// Point RAFFLE_TEST_DATABASE at a disposable migrated PostgreSQL database.
it.skipIf(!process.env.RAFFLE_TEST_DATABASE)('keeps excluded personal entries and draws only eligible members', async () => {
  const { Client } = createRequire(import.meta.url)('pg');
  const db = new Client({ database: process.env.RAFFLE_TEST_DATABASE });
  await db.connect();
  try {
    await db.query('begin');
    const [owner, disabled, restricted, eligible, admin, report] = Array.from({ length: 6 }, () => randomUUID());
    for (const id of [owner, disabled, restricted, eligible]) {
      await db.query('insert into public.app_users(id,privy_user_id,verified_email) values ($1,$2,$3)',
        [id, 'did:privy:' + id, id + (id === owner ? '@example.test' : '@kyaa.io')]);
    }
    await db.query('insert into public.admin_allowlist(id,email,role) values ($1,$2,\'admin\')', [admin, admin + '@example.test']);
    await db.query(`insert into public.content_reports(id,app_user_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
      values ($1,$2,'fan_post',$3,1,$4,'Synthetic report', $5)`, [report, eligible, randomUUID(), restricted, randomUUID()]);
    await db.query(`insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)
      values ($1,$2,'Synthetic restriction',$3)`, [restricted, report, admin]);
    const now = Date.now();
    const policy = { startsAt: new Date(now - 86400000).toISOString(), closesAt: new Date(now + 86400000).toISOString() };
    const window = [policy.startsAt, policy.closesAt];
    await db.query('set local role service_role');
    const refresh = async (_: unknown, id: string, enter: boolean) => (await db.query('select public.refresh_signup_raffle_participant($1,$2,$3,$4) as ok', [id, enter, ...window])).rows[0].ok;
    const read = async (id: string | null) => ({ ...(await db.query('select public.read_signup_raffle_snapshot($1,$2,$3) as snapshot', [id, ...window])).rows[0].snapshot, policy });
    mocks.authorize.mockResolvedValue({ appUserId: owner });
    mocks.refresh.mockImplementation(refresh);
    mocks.read.mockImplementation(read);
    vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
    for (const handler of [POST, GET]) {
      const response = await handler(new Request('http://localhost', { method: handler === POST ? 'POST' : 'GET' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ entered: true, chances: 1 });
    }
    for (const id of [disabled, restricted, eligible]) expect(await refresh(null, id, true)).toBe(true);
    await db.query('reset role');
    await db.query("update public.app_users set status='disabled' where id=$1", [disabled]);
    await db.query('set local role service_role');
    const snapshot = await read(null);
    const roster = candidates(snapshot);
    const winners = drawLocal(snapshot, roster.length);
    expect(winners.map(row => row.userId)).toContain(eligible);
    for (const id of [owner, disabled, restricted]) expect(winners.map(row => row.userId)).not.toContain(id);
  } finally {
    vi.unstubAllEnvs();
    await db.query('rollback');
    await db.end();
  }
});
