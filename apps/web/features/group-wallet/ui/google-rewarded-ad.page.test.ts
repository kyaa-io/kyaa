import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {REWARDED_TIMEOUT_MS,requestRewardedAd,type RewardedAdState,type RewardedGpt} from './google-rewarded-ad';

// H7 (dev 2026-11-08): GPT's rewarded overlay locks <body>, adds #goog_rewarded and fires a null-state popstate; the fan
// Dialog read that as Back and closed. This fake GPT does the same things to the page as the real one did on dev.
const DIALOG_LOCK='overflow: hidden; position: fixed; top: 0px; width: 100%;';
function fakeGpt({restoreOnClose=true}:{restoreOnClose?:boolean}={}){
 const handlers=new Map<string,(e:object)=>void>();const slot={addService:vi.fn().mockReturnThis()};
 let saved:{overflow:string;position:string;top:string}|null=null;
 const restore=()=>{if(!saved)return;Object.assign(document.body.style,saved);saved=null;};
 const service={addEventListener:(n:string,f:(e:object)=>void)=>handlers.set(n,f),removeEventListener:(n:string)=>handlers.delete(n),updateCorrelator:vi.fn()};
 const gpt={cmd:{push:(f:()=>void)=>f()},enums:{OutOfPageFormat:{REWARDED:1}},defineOutOfPageSlot:vi.fn(()=>slot),pubads:()=>service,enableServices:vi.fn(),display:vi.fn(),
  destroySlots:vi.fn(()=>{restore();document.getElementById('gpt-overlay')?.remove();return true;})} as unknown as RewardedGpt;
 const makeRewardedVisible=()=>{
  const b=document.body.style;saved={overflow:b.overflow,position:b.position,top:b.top};
  b.overflow='hidden';b.position='fixed';b.top='0px';b.removeProperty('width');
  const overlay=document.createElement('div');overlay.id='gpt-overlay';document.body.append(overlay);
  window.history.pushState(null,'','#goog_rewarded');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));
  return true;
 };
 return {gpt,slot,emit:(n:string,extra:object={})=>handlers.get(n)?.({slot,...extra}),makeRewardedVisible,
  close:()=>{if(restoreOnClose)restore();handlers.get('rewardedSlotClosed')?.({slot});}};
}
const backPresses=vi.fn();
beforeEach(()=>{
 window.history.replaceState({__fanOverlays:['overlay-1']},'','/benefits?locale=ko');
 document.body.setAttribute('style',DIALOG_LOCK);document.documentElement.removeAttribute('style');
 window.addEventListener('popstate',backPresses);
});
afterEach(()=>{window.removeEventListener('popstate',backPresses);backPresses.mockReset();vi.useRealTimers();document.body.removeAttribute('style');document.getElementById('gpt-overlay')?.remove();});
const page=()=>({body:document.body.getAttribute('style'),html:document.documentElement.getAttribute('style'),hash:window.location.hash,href:window.location.pathname+window.location.search,overlay:Boolean(document.getElementById('gpt-overlay'))});

it('keeps the hash popstate from the page while the ad is up, then leaves the page as before after a reward',()=>{
 const g=fakeGpt(),states:RewardedAdState[]=[];const ad=requestRewardedAd(g.gpt,'/22639388115/rewarded_web_example',s=>states.push(s));
 g.emit('rewardedSlotReady',{makeRewardedVisible:g.makeRewardedVisible});expect(ad.show()).toBe(true);
 expect(backPresses).not.toHaveBeenCalled();expect(window.history.state).toEqual({__fanOverlays:['overlay-1']});
 g.emit('rewardedSlotGranted');g.close();
 expect(states).toEqual(['loading','ready','showing','earned','closed']);
 expect(page()).toEqual({body:DIALOG_LOCK,html:null,hash:'',href:'/benefits?locale=ko',overlay:false});
});
it('restores the pre-ad page when the ad closes without GPT undoing its own lock',()=>{
 const g=fakeGpt({restoreOnClose:false}),states:RewardedAdState[]=[];const ad=requestRewardedAd(g.gpt,'/1/test',s=>states.push(s));
 g.emit('rewardedSlotReady',{makeRewardedVisible:g.makeRewardedVisible});ad.show();g.close();
 expect(states.at(-1)).toBe('cancelled');expect(page()).toEqual({body:DIALOG_LOCK,html:null,hash:'',href:'/benefits?locale=ko',overlay:false});
});
it('does not put a closed overlay\'s lock back when that overlay already restored the page during the ad',()=>{
 const g=fakeGpt();const ad=requestRewardedAd(g.gpt,'/1/test',()=>{});
 g.emit('rewardedSlotReady',{makeRewardedVisible:g.makeRewardedVisible});ad.show();
 document.body.setAttribute('style','');// the Dialog closed (ESC, navigation) and put the page back first
 ad.cancel();// its unmount then cancels the ad; GPT restores the lock it saved, which was the Dialog's
 expect(page()).toEqual({body:'',html:null,hash:'',href:'/benefits?locale=ko',overlay:false});
});
it.each(['timeout','no-fill','cancel-while-loading'])('leaves the page untouched on %s',ending=>{
 vi.useFakeTimers();const g=fakeGpt(),states:RewardedAdState[]=[];const ad=requestRewardedAd(g.gpt,'/1/test',s=>states.push(s));
 if(ending==='timeout')vi.advanceTimersByTime(REWARDED_TIMEOUT_MS);if(ending==='no-fill')g.emit('slotRenderEnded',{isEmpty:true});if(ending==='cancel-while-loading')ad.cancel();
 expect(states.at(-1)).toBe(ending==='timeout'?'error':ending==='no-fill'?'no-fill':'cancelled');
 expect(page()).toEqual({body:DIALOG_LOCK,html:null,hash:'',href:'/benefits?locale=ko',overlay:false});
});
it('gives up on a slot that never fills within 10 seconds',()=>{
 vi.useFakeTimers();const g=fakeGpt(),states:RewardedAdState[]=[];requestRewardedAd(g.gpt,'/1/test',s=>states.push(s));
 vi.advanceTimersByTime(REWARDED_TIMEOUT_MS-1);expect(states.at(-1)).toBe('loading');vi.advanceTimersByTime(1);expect(states.at(-1)).toBe('error');
 expect(REWARDED_TIMEOUT_MS).toBe(10000);
});
it('stops guarding once the ad ended: a later Back reaches the page again',()=>{
 const g=fakeGpt();const ad=requestRewardedAd(g.gpt,'/1/test',()=>{});g.emit('rewardedSlotReady',{makeRewardedVisible:g.makeRewardedVisible});ad.show();g.close();
 window.dispatchEvent(new PopStateEvent('popstate',{state:null}));expect(backPresses).toHaveBeenCalledTimes(1);
});
it('keeps the scroll position when it drops the hash',()=>{
 document.body.removeAttribute('style');const scrollTo=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 const g=fakeGpt();const ad=requestRewardedAd(g.gpt,'/1/test',()=>{});g.emit('rewardedSlotReady',{makeRewardedVisible:g.makeRewardedVisible});ad.show();g.close();
 expect(window.location.hash).toBe('');expect(scrollTo).not.toHaveBeenCalled();scrollTo.mockRestore();
});
