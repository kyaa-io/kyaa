import {afterEach,expect,it,vi} from 'vitest';
import {rewardedAdUnit,requestRewardedAd,type RewardedGpt,type RewardedAdState} from './google-rewarded-ad';
function mockGpt(supported=true){
 const handlers=new Map<string,Function>();const slot={addService:vi.fn().mockReturnThis()};
 const service={addEventListener:(name:string,fn:Function)=>handlers.set(name,fn),removeEventListener:(name:string)=>handlers.delete(name),updateCorrelator:vi.fn()};
 const gpt={cmd:{push:(fn:Function)=>fn()},enums:{OutOfPageFormat:{REWARDED:1}},defineOutOfPageSlot:vi.fn(()=>supported?slot:null),pubads:()=>service,enableServices:vi.fn(),display:vi.fn(),destroySlots:vi.fn(()=>true)} as unknown as RewardedGpt;
 return {gpt,slot,service,handlers,emit:(name:string,extra:object={})=>handlers.get(name)?.({slot,...extra})};
}
afterEach(()=>vi.useRealTimers());
it('requires ready and explicit show; video completion is not a reward; closes and cleans up',()=>{
 const m=mockGpt(),states:RewardedAdState[]=[];const ad=requestRewardedAd(m.gpt,'/123/test',s=>states.push(s));
 expect(ad.show()).toBe(false);m.emit('rewardedSlotGranted');expect(states).toEqual(['loading']);
 const visible=vi.fn(()=>true);m.emit('rewardedSlotReady',{makeRewardedVisible:visible});expect(visible).not.toHaveBeenCalled();
 expect(ad.show()).toBe(true);expect(ad.show()).toBe(false);m.emit('rewardedSlotVideoCompleted');expect(states.at(-1)).toBe('showing');
 m.emit('rewardedSlotGranted');m.emit('rewardedSlotGranted');m.emit('rewardedSlotClosed');
 expect(states).toEqual(['loading','ready','showing','earned','closed']);expect(m.handlers.size).toBe(0);expect(m.gpt.destroySlots).toHaveBeenCalledWith([m.slot]);
});
it.each(['cancel','close','no-fill','timeout','unsupported'])('never earns on %s',action=>{
 vi.useFakeTimers();const m=mockGpt(action!=='unsupported'),states:RewardedAdState[]=[];const ad=requestRewardedAd(m.gpt,'/123/test',s=>states.push(s));
 if(action==='cancel')ad.cancel();if(action==='close')m.emit('rewardedSlotClosed');if(action==='no-fill')m.emit('slotRenderEnded',{isEmpty:true});if(action==='timeout')vi.advanceTimersByTime(15000);
 m.emit('rewardedSlotGranted');expect(states).not.toContain('earned');expect(states.at(-1)).toBe(action==='timeout'?'error':action==='no-fill'?'no-fill':action==='unsupported'?'unsupported':'cancelled');
});
it('isolates events from other slots, rejects concurrent requests, and allows retry after disposal',()=>{
 const m=mockGpt(),states:RewardedAdState[]=[];const ad=requestRewardedAd(m.gpt,'/123/test',s=>states.push(s));
 m.emit('rewardedSlotGranted',{slot:{}});expect(states).toEqual(['loading']);
 expect(()=>requestRewardedAd(m.gpt,'/123/test',()=>{})).toThrow('BUSY');ad.cancel();const retry=requestRewardedAd(m.gpt,'/123/test',()=>{});retry.cancel();
});
it('asks for a new page view on every request, because a second rewarded request in the same view comes back empty',()=>{
 const m=mockGpt();requestRewardedAd(m.gpt,'/123/test',()=>{}).cancel();const second=requestRewardedAd(m.gpt,'/123/test',()=>{});second.cancel();
 expect(m.service.updateCorrelator).toHaveBeenCalledTimes(2);
 const first=m.service.updateCorrelator.mock.invocationCallOrder[1]!,display=vi.mocked(m.gpt.display).mock.invocationCallOrder[1]!;expect(first).toBeLessThan(display);
});
it('rejects unconfigured ad unit without loading inventory',()=>{const m=mockGpt();expect(()=>requestRewardedAd(m.gpt,'',()=>{})).toThrow('AD_UNIT_INVALID');expect(m.gpt.display).not.toHaveBeenCalled();});
it('fails closed when visibility fails',()=>{const m=mockGpt(),states:RewardedAdState[]=[];const ad=requestRewardedAd(m.gpt,'/123/test',s=>states.push(s));m.emit('rewardedSlotReady',{makeRewardedVisible:()=>false});expect(ad.show()).toBe(false);expect(states.at(-1)).toBe('error');});

it('reads the ad unit from the server runtime value or the page meta tag, never from a build-time public value alone',()=>{
 vi.stubEnv('NEXT_PUBLIC_REWARDED_AD_UNIT','');vi.stubEnv('KYAA_REWARDED_AD_UNIT','');expect(rewardedAdUnit()).toBeUndefined();
 document.head.innerHTML='<meta name="kyaa-rewarded-ad-unit" content="/9/runtime">';expect(rewardedAdUnit()).toBe('/9/runtime');
 document.head.innerHTML='';vi.unstubAllEnvs();
});

it('ignores an empty render while showing or after the reward, but still ends an unfilled request as no-fill',()=>{
 const m=mockGpt(),states:RewardedAdState[]=[];const ad=requestRewardedAd(m.gpt,'/123/test',s=>states.push(s));
 m.emit('rewardedSlotReady',{makeRewardedVisible:()=>true});ad.show();m.emit('slotRenderEnded',{isEmpty:true});
 expect(states.at(-1)).toBe('showing');m.emit('rewardedSlotGranted');m.emit('slotRenderEnded',{isEmpty:true});
 expect(states.at(-1)).toBe('earned');m.emit('slotRenderEnded',{isEmpty:true,slot:{}});m.emit('rewardedSlotClosed');expect(states.at(-1)).toBe('closed');
 const n=mockGpt(),other:RewardedAdState[]=[];requestRewardedAd(n.gpt,'/123/test',s=>other.push(s));
 n.emit('slotRenderEnded',{isEmpty:true,slot:{}});expect(other).toEqual(['loading']);n.emit('slotRenderEnded',{isEmpty:true});expect(other.at(-1)).toBe('no-fill');
});
