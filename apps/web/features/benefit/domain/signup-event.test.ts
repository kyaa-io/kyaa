import { expect,it } from 'vitest';
import { inRaffleWindow,rafflePolicySchema,signupEvent,raffleChannelHref } from './signup-event';
it('uses the approved prize distribution and configurable closing boundary',()=>{
 expect(signupEvent.prizes.reduce((sum,p)=>sum+p.quantity,0)).toBe(17);
 expect(signupEvent.prizes.reduce((sum,p)=>sum+p.quantity*p.usd,0)).toBe(400);
 const policy=rafflePolicySchema.parse({});expect(policy.weights).toEqual({comment:1,attendance:1});
 expect(inRaffleWindow('2026-11-30T14:59:59.999Z',policy)).toBe(true);expect(inRaffleWindow('2026-11-30T15:00:00Z',policy)).toBe(false);
 expect(rafflePolicySchema.safeParse({timeZone:'invalid'}).success).toBe(false);
});
it('keeps one canonical destination and public channel UTM fields',()=>{
 for(const channel of ['instagram','facebook','threads'] as const){const url=new URL(raffleChannelHref(channel),'https://kyaa.io');expect(url.pathname).toBe('/s/raffle');expect(url.searchParams.get('utm_source')).toBe(channel);expect(url.searchParams.get('utm_medium')).toBe('social');expect(url.searchParams.get('utm_campaign')).toBe('kyaa-raffle-202611');expect(url.searchParams.get('utm_content')).toBe('content.social');}
});
