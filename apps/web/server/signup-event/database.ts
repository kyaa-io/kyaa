import { hkdfSync } from 'node:crypto';
import { z } from 'zod';
import { createClient, type DataClient } from '../data/client';
import { loadServerEnv } from '../config/env';
import { rafflePolicySchema, signupEvent } from '../../features/benefit/domain/signup-event';
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
/** Key for the export alias. Derived with its own label so the alias never shares key material with another use. */
export function signupRaffleAliasKey() {
  const secret = loadServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SIGNUP_RAFFLE_ALIAS_KEY_UNAVAILABLE');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'kyaa-signup-raffle-alias-v1', 32));
}
const drawRow = z.object({ userId: z.uuid(), entries: z.number().int().positive() }).strict();
const storedDrawSchema = z.object({ created: z.boolean(), seedSha256: z.string().regex(/^[a-f0-9]{64}$/), drawnAt: z.string().min(1), winners: z.array(drawRow).min(1) }).strict();
export type SignupRaffleDrawRow = z.infer<typeof drawRow>;
/** The stored draw of the event, or null when no draw has been stored yet. */
export async function readSignupRaffleDraw(database: Pick<DataClient, 'rpc'>) {
  const result = await database.rpc('read_signup_raffle_draw', { p_event_id: signupEvent.id });
  if (result.error) throw new Error('SIGNUP_RAFFLE_DRAW_FAILED');
  return result.data === null ? null : storedDrawSchema.parse(result.data);
}
/**
 * Stores the draw of the event once and returns what is stored. A later call (retry, another admin, another seed)
 * gets the first stored winners back. The database refuses a first draw before the event has closed.
 */
export async function recordSignupRaffleDraw(database: Pick<DataClient, 'rpc'>, input: { closesAt: string; seed: string; actor: string; allowlistId: string; candidates: SignupRaffleDrawRow[]; winners: SignupRaffleDrawRow[] }) {
  const result = await database.rpc('record_signup_raffle_draw', {
    p_event_id: signupEvent.id, p_closes_at: input.closesAt, p_seed: input.seed, p_actor: input.actor, p_allowlist_id: input.allowlistId,
    p_candidates: input.candidates, p_winners: input.winners,
  });
  if (result.error) throw new Error(String(result.error.message ?? '').includes('SIGNUP_RAFFLE_NOT_CLOSED') ? 'SIGNUP_RAFFLE_NOT_CLOSED' : 'SIGNUP_RAFFLE_DRAW_FAILED');
  return storedDrawSchema.parse(result.data);
}
