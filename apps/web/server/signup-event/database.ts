import { createClient, type DataClient } from '../data/client';
import { loadServerEnv } from '../config/env';
import { rafflePolicySchema } from '../../features/benefit/domain/signup-event';
import { localSnapshotSchema, type LocalSnapshot } from './local';
export function createSignupRaffleDatabase() {
  const env = loadServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function readSignupRaffleSnapshot(database: Pick<DataClient, 'rpc'>, userId?: string): Promise<LocalSnapshot> {
  const policy = rafflePolicySchema.parse({});
  const result = await database.rpc('read_signup_raffle_snapshot', {
    p_user_id: userId ?? null, p_starts_at: policy.startsAt, p_closes_at: policy.closesAt,
  });
  if (result.error) throw new Error('SIGNUP_RAFFLE_READ_FAILED');
  return localSnapshotSchema.parse(result.data);
}
