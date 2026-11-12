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
  // referral: 내 초대 링크로 가입하고 응모한 친구 한 명당(사용자 결정 2026-11-13). 댓글·출석과 달리 하루 상한이 없고 친구마다 한 번이다.
  weights: z.object({ comment: z.number().int().nonnegative().default(1), attendance: z.number().int().nonnegative().default(1), referral: z.number().int().nonnegative().default(3) }).default({ comment: 1, attendance: 1, referral: 3 }),
  dailyCaps: z.object({ comment: z.number().int().nonnegative().nullable(), attendance: z.number().int().nonnegative().nullable() }).default({ comment: 3, attendance: 3 }),
}).refine(value => Date.parse(value.startsAt) <= Date.parse(value.closesAt));
export type RafflePolicy = z.infer<typeof rafflePolicySchema>;
export function inRaffleWindow(time: string, policy: RafflePolicy): boolean {
  return Date.parse(time) >= Date.parse(policy.startsAt) && Date.parse(time) <= Date.parse(policy.closesAt);
}
/** 친구 초대 코드(기존 친구 초대의 24자리 코드). 공유 주소 `/s/raffle?invite=<코드>`로 오간다. */
export const raffleInviteCodePattern = /^[A-F0-9]{24}$/;
export function raffleInviteCode(value: unknown): string | undefined {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return raffleInviteCodePattern.test(code) ? code : undefined;
}
/** 내 초대 코드가 붙은 공유 주소. 코드가 없으면(비로그인) 일반 공유 주소. */
export function raffleShareHref(code?: string) {
  const query = new URLSearchParams({ utm_source: 'share', utm_medium: 'social', utm_campaign: signupEvent.id, utm_content: 'content.share' });
  const invite = raffleInviteCode(code);
  if (invite) query.set('invite', invite);
  return `${signupEvent.href}?${query}`;
}
/** Incoming SNS links share one destination; only the public channel varies. */
export function raffleChannelHref(channel: 'instagram' | 'facebook' | 'threads') {
  return `${signupEvent.href}?utm_source=${channel}&utm_medium=social&utm_campaign=${signupEvent.id}&utm_content=content.social`;
}
