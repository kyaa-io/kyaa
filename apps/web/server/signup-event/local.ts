import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { isSignupEventEligible, signupEvent } from '../../features/benefit/domain/signup-event';

const actionKinds = ['share-click', 'referral-signup', 'attendance', 'post'] as const;
export const localSnapshotSchema = z.object({
  users: z.array(z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) }).strict()),
  // Only server verified records belong here; client analytics are not reward evidence.
  actions: z.array(z.object({ userId: z.uuid(), kind: z.enum(actionKinds), sourceId: z.string().trim().min(1).max(250), occurredAt: z.iso.datetime({ offset: true }), referredUserId: z.uuid().optional() }).strict()),
  draftWeights: z.record(z.enum(actionKinds), z.number().int().min(0).max(10000)),
}).strict();
export type LocalSnapshot = z.infer<typeof localSnapshotSchema>;
export function localSignupEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== 'production' && env.KYAA_SIGNUP_EVENT_LOCAL === '1';
}
export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  if (!localSignupEnabled()) throw new Error('SIGNUP_EVENT_LOCAL_DISABLED');
  // A local file adapter deliberately has no database client or write path.
  const raw = JSON.parse(await readFile(process.env.KYAA_SIGNUP_EVENT_SNAPSHOT ?? 'board/tasks/signup-event/local.json', 'utf8'));
  if ('app_users' in raw) return (await import('./source-adapter')).projectSources(raw);
  return localSnapshotSchema.parse(raw);
}
export function candidates(input: LocalSnapshot) {
  const snapshot = localSnapshotSchema.parse(input);
  const users = new Map(snapshot.users.map(user => [user.id, user]));
  if (users.size !== snapshot.users.length) throw new Error('DUPLICATE_USER');
  return snapshot.users.filter(user => isSignupEventEligible(user.createdAt)).map(user => {
    const seen = new Set<string>();
    let entries = 1;
    for (const action of snapshot.actions) {
      if (action.userId !== user.id || Date.parse(action.occurredAt) < Date.parse(user.createdAt) || Date.parse(action.occurredAt) >= Date.parse(signupEvent.endsAtExclusive)) continue;
      if (action.kind === 'referral-signup') {
        const referred = action.referredUserId && users.get(action.referredUserId);
        if (!referred || referred.id === user.id || !isSignupEventEligible(referred.createdAt) || Date.parse(referred.createdAt) > Date.parse(action.occurredAt)) continue;
      }
      const source = action.kind === 'referral-signup' ? action.referredUserId : action.sourceId;
      const key = `${action.kind}:${source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries += snapshot.draftWeights[action.kind];
    }
    return { userId: user.id, entries };
  });
}
// Same exponential weighted ranking as phase4_weighted_benefit_draw.sql.
export function drawLocal(input: LocalSnapshot, quantity: number, seed = randomBytes(32).toString('hex')) {
  const rows = candidates(input);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > rows.length) throw new Error('INVALID_WINNER_QUANTITY');
  return rows.map(row => {
    const digest = createHash('sha256').update(`${seed}:${signupEvent.id}:${row.userId}`).digest('hex');
    const uniform = (Number.parseInt(digest.slice(0, 13), 16) + 1) / (2 ** 52 + 1);
    return { ...row, rank: -Math.log(uniform) / row.entries };
  }).sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId)).slice(0, quantity);
}
export function maskedCsv(rows: { userId: string; entries: number }[]) {
  // A stable event alias joins participant/winner exports without raw account identifiers.
  return '\uFEFF회원,응모권\r\n' + rows.map(row => `회원-${createHash('sha256').update(`${signupEvent.id}:${row.userId}`).digest('hex').slice(0, 12)},${row.entries}`).join('\r\n');
}
