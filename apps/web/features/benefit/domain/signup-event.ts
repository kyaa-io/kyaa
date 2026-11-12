import { z } from 'zod';
export const signupEvent = {
  id: 'kyaa-raffle-202611', name: 'KYAA 래플', href: '/s/raffle',
  prizes: [{ usd: 100, quantity: 1 }, { usd: 50, quantity: 2 }, { usd: 25, quantity: 4 }, { usd: 10, quantity: 10 }],
} as const;
const timeZone = z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } });
export const rafflePolicySchema = z.object({
  startsAt: z.iso.datetime({ offset: true }).default('2026-11-10T15:00:00.000Z'),
  closesAt: z.iso.datetime({ offset: true }).default('2026-11-30T23:59:59.999+09:00'),
  timeZone: timeZone.default('Asia/Seoul'),
  weights: z.object({ comment: z.number().int().nonnegative().default(1), attendance: z.number().int().nonnegative().default(1) }).default({ comment: 1, attendance: 1 }),
  dailyCaps: z.object({ comment: z.number().int().nonnegative().nullable(), attendance: z.number().int().nonnegative().nullable() }).default({ comment: 3, attendance: 3 }),
}).refine(value => Date.parse(value.startsAt) <= Date.parse(value.closesAt));
export type RafflePolicy = z.infer<typeof rafflePolicySchema>;
export function inRaffleWindow(time: string, policy: RafflePolicy): boolean {
  return Date.parse(time) >= Date.parse(policy.startsAt) && Date.parse(time) <= Date.parse(policy.closesAt);
}
/** Incoming SNS links share one destination; only the public channel varies. */
export function raffleChannelHref(channel: 'instagram' | 'facebook' | 'threads') {
  return `${signupEvent.href}?utm_source=${channel}&utm_medium=social&utm_campaign=${signupEvent.id}&utm_content=content.social`;
}
