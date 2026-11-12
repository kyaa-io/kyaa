import { createHash, randomBytes } from 'node:crypto';
import { signupRaffleEnabled } from '../config/feature-flags';
import { z } from 'zod';
import { inRaffleWindow, rafflePolicySchema, signupEvent } from '../../features/benefit/domain/signup-event';

const actionKinds = ['attendance', 'comment', 'post', 'share-click', 'referral-signup'] as const;
export const localSnapshotSchema = z.object({
  users: z.array(z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }), passportReceived: z.boolean().default(false), communityJoined: z.boolean().default(false) }).strict()),
  // Only server verified records belong here; client analytics are not reward evidence.
  actions: z.array(z.object({ userId: z.uuid(), kind: z.enum(actionKinds), sourceId: z.string().trim().min(1).max(250), occurredAt: z.iso.datetime({ offset: true }), referredUserId: z.uuid().optional() }).strict()),
  // Legacy weights remain readable but no longer affect raffle rewards.
  draftWeights: z.record(z.string(), z.number().int().nonnegative()).optional(),
  policy: rafflePolicySchema.default(() => rafflePolicySchema.parse({})),
  entries: z.array(z.object({userId:z.uuid(),enteredAt:z.iso.datetime({offset:true})}).strict()).default([]),
}).strict();
export type LocalSnapshot = z.infer<typeof localSnapshotSchema>;
export function localSignupEnabled(env: Record<string, string | undefined> = process.env) {
  return signupRaffleEnabled(env);
}
export async function readLocalSnapshot(userId?: string): Promise<LocalSnapshot> {
  if (!localSignupEnabled()) throw new Error('SIGNUP_RAFFLE_DISABLED');
  const { createSignupRaffleDatabase, readSignupRaffleSnapshot } = await import('./database');
  return readSignupRaffleSnapshot(createSignupRaffleDatabase(), userId);
}
export function candidates(input: LocalSnapshot) {
  const snapshot = localSnapshotSchema.parse(input);
  const users = new Map(snapshot.users.map(user => [user.id, user]));
  if (users.size !== snapshot.users.length) throw new Error('DUPLICATE_USER');
  const entered = new Map<string, string>();
  for (const entry of snapshot.entries) {
    if (inRaffleWindow(entry.enteredAt, snapshot.policy) && (!entered.has(entry.userId) || Date.parse(entry.enteredAt) < Date.parse(entered.get(entry.userId)!))) entered.set(entry.userId, entry.enteredAt);
  }
  return snapshot.users.filter(user => entered.has(user.id) && user.passportReceived && user.communityJoined).map(user => {
    const seen = new Set<string>(), daily = new Map<string, number>();
    let entries = 1;
    const ordered = [...snapshot.actions].sort((a,b) => Date.parse(a.occurredAt)-Date.parse(b.occurredAt) || a.sourceId.localeCompare(b.sourceId));
    for (const action of ordered) {
      if (action.userId !== user.id || (action.kind !== 'comment' && action.kind !== 'attendance') || !inRaffleWindow(action.occurredAt,snapshot.policy) || Date.parse(action.occurredAt)<Date.parse(entered.get(user.id)!)) continue;
      const key = `${action.kind}:${action.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = new Intl.DateTimeFormat('en-CA',{timeZone:snapshot.policy.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(action.occurredAt));
      const bucket = `${action.kind}:${day}`, count = daily.get(bucket) ?? 0, cap = snapshot.policy.dailyCaps[action.kind];
      if (cap !== null && count >= cap) continue;
      daily.set(bucket,count+1);
      entries += snapshot.policy.weights[action.kind];
    }
    return { userId: user.id, entries };
  });
}
// Same exponential weighted ranking as phase4_weighted_benefit_draw.sql.
// shortcut: retries use the current local snapshot, use the persisted SQL draw before confirming winners.
export function drawLocal(input: LocalSnapshot, quantity: number, seed = randomBytes(32).toString('hex')) {
  const rows = candidates(input);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > rows.length) throw new Error('INVALID_WINNER_QUANTITY');
  return rows.map(row => {
    const digest = createHash('sha256').update(`${seed}:${signupEvent.id}:${row.userId}`).digest('hex');
    const uniform = (Number.parseInt(digest.slice(0, 13), 16) + 1) / (2 ** 52 + 1);
    return { ...row, rank: -Math.log(uniform) / row.entries };
  }).sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId)).slice(0, quantity);
}
export function maskedCsv(rows: { userId: string; entries: number; usd?: number }[]) {
  // A stable event alias joins participant/winner exports without raw account identifiers.
  return '\uFEFF회원,응모권,상품\r\n' + rows.map(row => `회원-${createHash('sha256').update(`${signupEvent.id}:${row.userId}`).digest('hex').slice(0, 12)},${row.entries},${row.usd ? `US$${row.usd}` : ''}`).join('\r\n');
}
