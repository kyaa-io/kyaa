import { expect,it } from 'vitest';
import { inRaffleWindow,rafflePolicySchema,signupEvent,raffleChannelHref,raffleInviteCode,raffleShareHref } from './signup-event';
it('uses the approved prize distribution and configurable closing boundary',()=>{
 expect(signupEvent.prizes.reduce((sum,p)=>sum+p.quantity,0)).toBe(17);
 expect(signupEvent.prizes.reduce((sum,p)=>sum+p.quantity*p.usd,0)).toBe(400);
 const policy=rafflePolicySchema.parse({});expect(policy.weights).toEqual({comment:1,attendance:1,referral:3});expect(policy.dailyCaps).toEqual({comment:3,attendance:3});
 expect(inRaffleWindow('2026-11-30T14:59:59.999Z',policy)).toBe(true);expect(inRaffleWindow('2026-11-30T15:00:00Z',policy)).toBe(false);
 expect(rafflePolicySchema.safeParse({timeZone:'invalid'}).success).toBe(false);
});
it('keeps one canonical destination and public channel UTM fields',()=>{
 for(const channel of ['instagram','facebook','threads'] as const){const url=new URL(raffleChannelHref(channel),'https://kyaa.io');expect(url.pathname).toBe('/s/raffle');expect(url.searchParams.get('utm_source')).toBe(channel);expect(url.searchParams.get('utm_medium')).toBe('social');expect(url.searchParams.get('utm_campaign')).toBe('kyaa-raffle-202611');expect(url.searchParams.get('utm_content')).toBe('content.social');}
});
it('puts only a well-formed invite code on the share address',()=>{
 expect(raffleInviteCode(' ab2300000000000000000001 ')).toBe('AB2300000000000000000001');
 for(const bad of ['AB23','AB230000000000000000000G','AB2300000000000000000001&x=1',undefined,123])expect(raffleInviteCode(bad)).toBeUndefined();
 const mine=new URL(raffleShareHref('ab2300000000000000000001'),'https://kyaa.io');
 expect(mine.pathname).toBe('/s/raffle');expect(mine.searchParams.get('invite')).toBe('AB2300000000000000000001');expect(mine.searchParams.get('utm_source')).toBe('share');
 expect(new URL(raffleShareHref(),'https://kyaa.io').searchParams.has('invite')).toBe(false);
 expect(new URL(raffleShareHref('nope'),'https://kyaa.io').searchParams.has('invite')).toBe(false);
});
