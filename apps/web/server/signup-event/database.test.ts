import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readSignupRaffleSnapshot } from './database';
it('reads a single database snapshot scoped to the authenticated member', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const rpc = vi.fn().mockResolvedValue({ data: {users: [], entries: [], actions: []}, error: null });
  expect((await readSignupRaffleSnapshot({ rpc }, id)).actions).toEqual([]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('read_signup_raffle_snapshot', {
    p_user_id: id, p_starts_at: '2026-11-10T15:00:00.000Z', p_closes_at: '2026-11-30T23:59:59.999+09:00',
  });
  await readSignupRaffleSnapshot({ rpc });
  expect(rpc.mock.calls[1][1].p_user_id).toBeNull();
});
it('fails closed when the snapshot cannot be read', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: {message: 'unavailable'} });
  await expect(readSignupRaffleSnapshot({ rpc })).rejects.toThrow('SIGNUP_RAFFLE_READ_FAILED');
});

it.each(['comment', 'attendance'] as const)('caps database-backed %s weights per KST day in exports and draws', async kind => {
  const id = '00000000-0000-4000-8000-000000000001';
  const { candidates, drawLocal, maskedCsv } = await import('./local');
  const data = {
    users: [{ id, createdAt: '2026-11-11T00:00:00Z', passportReceived: true, communityJoined: true }],
    entries: [{ userId: id, enteredAt: '2026-11-11T00:00:00Z' }],
    actions: [0, 1, 2].map(n => ({ userId: id, kind, sourceId: `${kind}:${n}`, occurredAt: `2026-11-11T14:00:0${n}Z` })),
  };
  const rpc = vi.fn().mockImplementation(async () => ({ data, error: null }));
  const weight = async () => candidates(await readSignupRaffleSnapshot({ rpc }))[0].entries;
  expect(await weight()).toBe(4);
  data.actions.push({ userId: id, kind, sourceId: 'fourth', occurredAt: '2026-11-11T14:59:59.999Z' });
  expect(await weight()).toBe(4);
  data.actions.push({ userId: id, kind, sourceId: 'next-day', occurredAt: '2026-11-11T15:00:00Z' });
  expect(await weight()).toBe(5);
  const otherKind = kind === 'comment' ? 'attendance' : 'comment';
  data.actions.push({ userId: id, kind: otherKind, sourceId: 'independent-cap', occurredAt: '2026-11-11T14:59:59Z' });
  const snapshot = await readSignupRaffleSnapshot({ rpc });
  expect(snapshot.policy.dailyCaps).toEqual({ comment: 3, attendance: 3 });
  expect(snapshot.policy.closesAt).toBe('2026-11-30T23:59:59.999+09:00');
  expect(candidates(snapshot)[0].entries).toBe(6);
  expect(maskedCsv(candidates(snapshot))).toContain(',6,');
  expect(drawLocal(snapshot, 1, 'caps-test')[0].entries).toBe(6);
});
