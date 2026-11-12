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
