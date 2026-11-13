import { z } from 'zod';
import { signupEvent } from '../../features/benefit/domain/signup-event';

/** 내 래플 결과. 저장된 추첨(signup_raffle_draws)이 있을 때만 won·lost가 나온다. 다른 당첨자는 담지 않는다. */
export const signupRaffleResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }).strict(),
  z.object({ state: z.literal('not-entered') }).strict(),
  z.object({ state: z.literal('lost') }).strict(),
  z.object({ state: z.literal('won'), usd: z.number().int().positive() }).strict(),
]);
export type SignupRaffleResult = z.infer<typeof signupRaffleResultSchema>;

/** 당첨자 순서대로 경품을 붙인다(관리자 당첨자 CSV와 같은 규칙: US$100 1명 → US$50 2명 → US$25 4명 → US$10 10명). */
export async function signupRaffleResultFor(userId: string, draw: { winners: readonly { userId: string }[] } | null, entered: () => Promise<boolean>): Promise<SignupRaffleResult> {
  if (!draw) return { state: 'pending' };
  const prizes = signupEvent.prizes.flatMap(prize => Array.from({ length: prize.quantity }, () => prize.usd));
  const at = draw.winners.findIndex(row => row.userId === userId);
  const usd = at >= 0 ? prizes[at] : undefined;
  if (usd) return { state: 'won', usd };
  return await entered() ? { state: 'lost' } : { state: 'not-entered' };
}
