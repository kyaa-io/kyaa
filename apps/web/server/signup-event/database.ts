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
const storedPage = 1000;
const storedEntry = z.object({ app_user_id: z.uuid(), entered_at: z.string(), passport_received: z.boolean(), community_joined: z.boolean() });
const storedAction = z.object({ app_user_id: z.uuid(), kind: z.string(), source_id: z.string(), occurred_at: z.string() });
async function readAll<T>(database: Pick<DataClient, 'from'>, table: string, columns: string, row: z.ZodType<T>) {
  const rows: T[] = [];
  for (let from = 0; ; from += storedPage) {
    const result = await database.from(table).select(columns).order('id').range(from, from + storedPage - 1);
    if (result.error) throw new Error('SIGNUP_RAFFLE_READ_FAILED');
    const page = z.array(row).parse(result.data);
    rows.push(...page);
    if (page.length < storedPage) return rows;
  }
}
/**
 * Everyone's stored raffle rows, read without refreshing them (read_signup_raffle_snapshot(null) would rewrite every participant).
 * A participant's rows are refreshed whenever that participant opens the page or enters, so this is at most slightly behind.
 * Used only for the page's approximate total of chances; the draw still reads the refreshed snapshot.
 */
export async function readSignupRaffleStored(database: Pick<DataClient, 'from'>): Promise<LocalSnapshot> {
  const [entries, actions] = await Promise.all([
    readAll(database, 'signup_raffle_entries', 'app_user_id,entered_at,passport_received,community_joined', storedEntry),
    readAll(database, 'signup_raffle_actions', 'app_user_id,kind,source_id,occurred_at', storedAction),
  ]);
  return localSnapshotSchema.parse({
    users: entries.map(row => ({ id: row.app_user_id, createdAt: row.entered_at, passportReceived: row.passport_received, communityJoined: row.community_joined })),
    entries: entries.map(row => ({ userId: row.app_user_id, enteredAt: row.entered_at })),
    actions: actions.map(row => ({ userId: row.app_user_id, kind: row.kind, sourceId: row.source_id, occurredAt: row.occurred_at })),
  });
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
/** 초대 링크로 들어온 친구에게 보일 초대한 사람의 닉네임. 코드가 없거나 그 사람이 보너스를 받을 수 없는 계정이면 null(화면은 일반 문구). */
export async function readRaffleInviterName(database: Pick<DataClient, 'rpc'>, code: string) {
  const result = await database.rpc('signup_raffle_inviter_nickname', { p_code: code });
  if (result.error) throw new Error('SIGNUP_RAFFLE_INVITER_READ_FAILED');
  const name = z.string().trim().min(1).nullable().catch(null).parse(result.data);
  if (!name) return null;
  // 닉네임은 512자까지 될 수 있다: 배너 한 줄에 들어가게 20글자에서 자른다(글자 단위, 이모지를 반으로 자르지 않는다).
  const letters = Array.from(name);
  return letters.length > 20 ? `${letters.slice(0, 20).join('')}…` : name;
}
