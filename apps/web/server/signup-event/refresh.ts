import type { DataClient } from '../data/client';
import { rafflePolicySchema } from '../../features/benefit/domain/signup-event';
import { localSignupEnabled } from './local';
/** The database reads original activity and serializes refreshes per participant. */
export async function refreshLocalSignupEvent(database: Pick<DataClient, 'rpc'>, userId: string, enter = false): Promise<boolean> {
  if (!localSignupEnabled()) return false;
  try {
    const policy = rafflePolicySchema.parse({});
    const result = await database.rpc('refresh_signup_raffle_participant', {
      p_user_id: userId, p_enter: enter, p_starts_at: policy.startsAt, p_closes_at: policy.closesAt,
    });
    if (result.error) throw new Error('RAFFLE_REFRESH_UNAVAILABLE');
    return result.data === true;
  } catch (error) {
    console.error('RAFFLE_REFRESH_FAILED', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}
