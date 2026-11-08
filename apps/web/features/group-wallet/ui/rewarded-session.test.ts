import {expect,it,vi} from 'vitest';
import {runRewardedSession,type RewardedSessionDeps} from './rewarded-session';
import {requestRewardedAd,type RewardedGpt} from './google-rewarded-ad';
import {rewardedSessionError,rewardedExchangeCopy} from './rewarded-copy';
import {APP_LOCALES} from '@/i18n/locales';
const sid='33333333-3333-4333-8333-333333333333';
function setup(post:RewardedSessionDeps['post'],unit:string|null='/1/test'){
 let emit:(s:never)=>void=()=>{};const requestAd=vi.fn((_g:unknown,_u:string,on:(s:never)=>void)=>{emit=on;return {show:()=>true,cancel:vi.fn()};});
 const loadGpt=vi.fn(async()=>({}) as never),onGranted=vi.fn(),onRefused=vi.fn(),onState=vi.fn();
 const deps:RewardedSessionDeps={post,unit:unit??undefined,loadGpt,requestAd:requestAd as never,onState,onGranted,onRefused,alive:()=>true};
 return {deps,requestAd,loadGpt,onGranted,onRefused,onState,emit:(s:string)=>emit(s as never)};
}
const flush=()=>new Promise(r=>setTimeout(r,0));
it.each(['GROUP_WALLET_AD_GATE_CLOSED','GROUP_WALLET_AD_CONFIG_MISSING','GROUP_WALLET_AD_DAILY_LIMIT','GROUP_WALLET_AD_RATE_LIMITED','GROUP_WALLET_INSUFFICIENT_BALANCE','GROUP_WALLET_WRITE_FENCED'])('never requests an ad when the session is refused: %s',async code=>{
 const m=setup(vi.fn(async()=>{throw Object.assign(new Error(code),{code});}));
 await runRewardedSession(m.deps);
 expect(m.loadGpt).not.toHaveBeenCalled();expect(m.requestAd).not.toHaveBeenCalled();expect(m.onRefused).toHaveBeenCalledTimes(1);expect(m.onGranted).not.toHaveBeenCalled();
});
it('never requests an ad or a session without a configured unit',async()=>{
 const post=vi.fn();const m=setup(post,null);await runRewardedSession(m.deps);
 expect(post).not.toHaveBeenCalled();expect(m.requestAd).not.toHaveBeenCalled();expect(m.onState).toHaveBeenCalledWith('unsupported');
});
it('rejects a malformed session response before any ad',async()=>{
 for(const bad of [null,{},{sessionId:sid,status:'invalid'}]){const m=setup(vi.fn(async()=>bad));await runRewardedSession(m.deps);expect(m.requestAd).not.toHaveBeenCalled();expect(m.onRefused).toHaveBeenCalled();}
});
it('issues first, then reports shown before granted, then hands the session to the exchange',async()=>{
 const calls:string[]=[];const post=vi.fn(async(path:string,body:unknown)=>{calls.push(path.split('/').pop()+(body&&(body as {event?:string}).event?':'+(body as {event:string}).event:''));return path.endsWith('report')?{sessionId:sid,status:(body as {event:string}).event,expiresAt:'x'}:{sessionId:sid,status:'issued',expiresAt:'x'};});
 const m=setup(post);await runRewardedSession(m.deps);
 expect(calls).toEqual(['ad-session']);expect(m.requestAd).toHaveBeenCalledTimes(1);
 m.emit('showing');m.emit('earned');await flush();await flush();
 expect(calls).toEqual(['ad-session','report:shown','report:granted']);expect(m.onGranted).toHaveBeenCalledWith(sid);
});
it('does not exchange when the server calls the reward invalid or the ad is only closed',async()=>{
 const post=vi.fn(async(path:string,body:unknown)=>path.endsWith('report')?{sessionId:sid,status:(body as {event:string}).event==='granted'?'invalid':'shown',expiresAt:'x'}:{sessionId:sid,status:'issued',expiresAt:'x'});
 const m=setup(post);await runRewardedSession(m.deps);m.emit('showing');m.emit('earned');await flush();await flush();
 expect(m.onGranted).not.toHaveBeenCalled();expect(m.onRefused).toHaveBeenCalledTimes(1);
 const n=setup(vi.fn(async()=>({sessionId:sid,status:'issued',expiresAt:'x'})));await runRewardedSession(n.deps);n.emit('showing');n.emit('cancelled');await flush();
 expect(n.onGranted).not.toHaveBeenCalled();
});
it('reuses a watched unspent session without a second ad',async()=>{
 const m=setup(vi.fn(async()=>({sessionId:sid,status:'granted',expiresAt:'x'})));await runRewardedSession(m.deps);
 expect(m.requestAd).not.toHaveBeenCalled();expect(m.onGranted).toHaveBeenCalledWith(sid);
});
it('has session error copy in all 12 languages',()=>{
 expect(APP_LOCALES.length).toBe(12);
 for(const locale of APP_LOCALES){for(const code of ['GROUP_WALLET_AD_DAILY_LIMIT','GROUP_WALLET_AD_RATE_LIMITED','GROUP_WALLET_AD_SESSION_INVALID'])expect(rewardedSessionError(locale,code)?.length).toBeGreaterThan(3);expect(rewardedSessionError(locale,'GROUP_WALLET_AD_GATE_CLOSED')).toBe(rewardedExchangeCopy(locale).adOff);}
});
it('hands the ad show control to the caller once the ad is requested',async()=>{
 const post=vi.fn(async()=>({sessionId:sid,status:'issued'}));const m=setup(post);
 const handle=await runRewardedSession(m.deps);
 expect(handle.show()).toBe(true);
});
it('reports no show control when the session was refused before any ad',async()=>{
 const m=setup(vi.fn(async()=>{throw new Error('GROUP_WALLET_AD_DAILY_LIMIT');}));
 const handle=await runRewardedSession(m.deps);
 expect(handle.show()).toBe(false);expect(m.requestAd).not.toHaveBeenCalled();
});

// Retry after every kind of ending issues a new session and a new ad request (real requestRewardedAd over a fake googletag).
function fakeGpt(){
 const handlers=new Map<string,(e:object)=>void>();let defined=0;const slot={addService:vi.fn().mockReturnThis()};
 const service={addEventListener:(n:string,f:(e:object)=>void)=>handlers.set(n,f),removeEventListener:(n:string)=>handlers.delete(n)};
 const gpt={cmd:{push:(f:()=>void)=>f()},enums:{OutOfPageFormat:{REWARDED:1}},defineOutOfPageSlot:vi.fn(()=>{defined++;return slot;}),pubads:()=>service,enableServices:vi.fn(),display:vi.fn(),destroySlots:vi.fn(()=>true)} as unknown as RewardedGpt;
 return {gpt,defined:()=>defined,emit:(n:string,extra:object={})=>handlers.get(n)?.({slot,...extra})};
}
it.each(['cancel','no-fill','report-failure','load-error'])('a retry after %s issues a new session and a new ad request',async ending=>{
 const g=fakeGpt();let issued=0;
 const post=vi.fn(async(path:string,body:unknown)=>{
  if(path.endsWith('report')){if(ending==='report-failure')throw Object.assign(new Error('x'),{code:'GROUP_WALLET_UNAVAILABLE'});return {sessionId:sid,status:(body as {event:string}).event,expiresAt:'x'};}
  issued++;return {sessionId:sid,status:'issued',expiresAt:'x'};
 });
 const run=()=>{const m=setup(post);m.deps.requestAd=requestRewardedAd as never;m.deps.loadGpt=(async()=>g.gpt) as never;return m;};
 const first=run();const h=await runRewardedSession(first.deps);
 if(ending==='no-fill')g.emit('slotRenderEnded',{isEmpty:true});
 else if(ending==='load-error'){vi.useFakeTimers();vi.advanceTimersByTime(15000);vi.useRealTimers();}
 else{g.emit('rewardedSlotReady',{makeRewardedVisible:()=>true});h.show();if(ending==='cancel')g.emit('rewardedSlotClosed');else{await flush();g.emit('rewardedSlotGranted');await flush();}}
 if(ending==='load-error')h.cancel();
 if(ending==='report-failure')h.cancel();
 const second=run();const h2=await runRewardedSession(second.deps);
 expect(issued).toBe(2);expect(g.defined()).toBe(2);h2.cancel();
});
it('a second press while an ad is up leaves that ad\'s state alone',async()=>{
 const m=setup(vi.fn(async()=>({sessionId:sid,status:'issued',expiresAt:'x'})));
 m.deps.requestAd=(()=>{throw new Error('REWARDED_AD_BUSY');}) as never;
 await runRewardedSession(m.deps);
 expect(m.onState).toHaveBeenCalledWith('loading');expect(m.onState).not.toHaveBeenCalledWith('error');
});
