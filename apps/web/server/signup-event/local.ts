import { createHash, createHmac, randomBytes } from 'node:crypto';
import { signupRaffleEnabled } from '../config/feature-flags';
import { z } from 'zod';
import { inRaffleWindow, rafflePolicySchema, signupEvent } from '../../features/benefit/domain/signup-event';

const actionKinds = ['attendance', 'comment', 'post', 'share-click', 'referral-signup', 'passport', 'community'] as const;
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
/**
 * 응모한 회원마다 당첨 기회 수를 센다(서버 값만). 응모만 하면 추첨 대상이다(사용자 결정 2026-11-13).
 * 기본 1 + Fan Passport 1·커뮤니티 가입 1(각 한 번) + 댓글·출석(응모 뒤, 종류별 하루 상한) + 친구 초대(친구 한 명당 한 번, 상한 없음).
 * Fan Passport·커뮤니티·친구 초대 행은 DB가 만들어 준다(20261224050000, 20261224060000). 여기서는 중복만 걸러 가중치를 더한다.
 */
export function raffleChances(input: LocalSnapshot) {
  const snapshot = localSnapshotSchema.parse(input);
  const users = new Map(snapshot.users.map(user => [user.id, user]));
  if (users.size !== snapshot.users.length) throw new Error('DUPLICATE_USER');
  const entered = new Map<string, string>();
  for (const entry of snapshot.entries) {
    if (inRaffleWindow(entry.enteredAt, snapshot.policy) && (!entered.has(entry.userId) || Date.parse(entry.enteredAt) < Date.parse(entered.get(entry.userId)!))) entered.set(entry.userId, entry.enteredAt);
  }
  const ordered = [...snapshot.actions].sort((a,b) => Date.parse(a.occurredAt)-Date.parse(b.occurredAt) || a.sourceId.localeCompare(b.sourceId));
  return snapshot.users.filter(user => entered.has(user.id)).map(user => {
    const seen = new Set<string>(), daily = new Map<string, number>(), friends = new Set<string>(), once = new Set<string>();
    let entries = 1;
    for (const action of ordered) {
      if (action.userId !== user.id || !inRaffleWindow(action.occurredAt,snapshot.policy)) continue;
      if (action.kind === 'passport' || action.kind === 'community') {
        // 끝낸 시점이 응모 전이어도 센다. 종류마다 한 번.
        if (once.has(action.kind)) continue;
        once.add(action.kind);
        entries += snapshot.policy.weights[action.kind];
        continue;
      }
      if (action.kind === 'referral-signup') {
        // 친구는 한 번만: 같은 행이 두 번 오거나 같은 친구가 다른 행으로 와도 한 번. 본인은 친구가 아니다.
        const friend = action.referredUserId ?? action.sourceId;
        if (action.referredUserId === user.id || friends.has(friend)) continue;
        friends.add(friend);
        entries += snapshot.policy.weights.referral;
        continue;
      }
      if ((action.kind !== 'comment' && action.kind !== 'attendance') || Date.parse(action.occurredAt)<Date.parse(entered.get(user.id)!)) continue;
      const key = `${action.kind}:${action.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = new Intl.DateTimeFormat('en-CA',{timeZone:snapshot.policy.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(action.occurredAt));
      const bucket = `${action.kind}:${day}`, count = daily.get(bucket) ?? 0, cap = snapshot.policy.dailyCaps[action.kind];
      if (cap !== null && count >= cap) continue;
      daily.set(bucket,count+1);
      entries += snapshot.policy.weights[action.kind];
    }
    return { userId: user.id, entries, friends: friends.size };
  });
}
/**
 * 화면에 보이는 대략 확률의 분모: 응모한 모든 회원의 당첨 기회 합계. 다른 회원은 저장된 값(stored), 나는 방금 센 값(mine)을 쓴다.
 * 추첨(drawLocal)과 같은 계산식이라 분모가 추첨 후보 전체와 같다.
 */
export function raffleTotalChances(stored: LocalSnapshot, mine: { userId: string; entries: number }) {
  return raffleChances(stored).reduce((sum, row) => row.userId === mine.userId ? sum : sum + row.entries, mine.entries);
}
/** 추첨 후보 = 기간 안에 응모한 회원 전원. Fan Passport·커뮤니티는 자격이 아니라 기회 +1이다. */
export function candidates(input: LocalSnapshot) {
  return raffleChances(input).map(({ userId, entries }) => ({ userId, entries }));
}
// Same exponential weighted ranking as phase4_weighted_benefit_draw.sql.
// The seed is made on the server (never taken from a request). The admin route stores the first result of an event with
// record_signup_raffle_draw and always answers with that stored row, so a draw cannot be repeated for another outcome.
export function drawLocal(input: LocalSnapshot, quantity: number, seed = randomBytes(32).toString('hex')) {
  const rows = candidates(input);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > rows.length) throw new Error('INVALID_WINNER_QUANTITY');
  return rows.map(row => {
    const digest = createHash('sha256').update(`${seed}:${signupEvent.id}:${row.userId}`).digest('hex');
    const uniform = (Number.parseInt(digest.slice(0, 13), 16) + 1) / (2 ** 52 + 1);
    return { ...row, rank: -Math.log(uniform) / row.entries };
  }).sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId)).slice(0, quantity);
}
export function maskedCsv(rows: { userId: string; entries: number; usd?: number }[], aliasKey: Buffer) {
  // A stable event alias joins participant/winner exports without raw account identifiers.
  // It is keyed with a server secret, so someone who knows a member id cannot recompute the alias and find that member's row.
  return '\uFEFF회원,응모권,상품\r\n' + rows.map(row => `회원-${createHmac('sha256', aliasKey).update(`${signupEvent.id}:${row.userId}`).digest('hex').slice(0, 12)},${row.entries},${row.usd ? `US$${row.usd}` : ''}`).join('\r\n');
}
