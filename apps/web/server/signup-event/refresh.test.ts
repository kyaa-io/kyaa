import { afterEach, expect, it, vi } from 'vitest';
import { refreshLocalSignupEvent } from './refresh';
afterEach(() => vi.unstubAllEnvs());
it('uses only the authenticated owner and server policy in the source-reading RPC', async () => {
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  expect(await refreshLocalSignupEvent({ rpc }, 'owner', true)).toBe(true);
  expect(rpc).toHaveBeenCalledWith('refresh_signup_raffle_participant', {
    p_user_id: 'owner', p_enter: true,
    p_starts_at: '2026-11-10T15:00:00.000Z', p_closes_at: '2026-11-30T23:59:59.999+09:00',
  });
});
it('does not touch the database when disabled and fails closed on RPC errors', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } });
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'false');
  expect(await refreshLocalSignupEvent({ rpc }, 'owner')).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  expect(await refreshLocalSignupEvent({ rpc }, 'owner')).toBe(false);
});
