import {act,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {Dialog} from '@/components/ui/overlay/accessible-overlay';
import {requestRewardedAd,type RewardedGpt} from './google-rewarded-ad';

// H7 end to end in the DOM: the real fan Dialog stays open while GPT adds #goog_rewarded, and after the ad the body is the
// Dialog's lock again (width included) and the address has no hash.
it('keeps the exchange Dialog open through the rewarded overlay and puts the page back after it',async()=>{
 window.history.replaceState(null,'','/benefits?locale=ko');
 const handlers=new Map<string,(e:object)=>void>();const slot={addService:vi.fn().mockReturnThis()};let saved:Record<string,string>|null=null;
 const restore=()=>{if(saved){Object.assign(document.body.style,saved);saved=null;}};
 const gpt={cmd:{push:(f:()=>void)=>f()},enums:{OutOfPageFormat:{REWARDED:1}},defineOutOfPageSlot:()=>slot,
  pubads:()=>({addEventListener:(n:string,f:(e:object)=>void)=>handlers.set(n,f),removeEventListener:(n:string)=>handlers.delete(n)}),
  enableServices:()=>{},display:()=>{},destroySlots:()=>{restore();return true;}} as unknown as RewardedGpt;
 const onClose=vi.fn();
 render(<Dialog open onClose={onClose} labelledBy="t"><h2 id="t">모임 응모권 전환</h2></Dialog>);
 await act(async()=>{await new Promise(r=>setTimeout(r,0));});
 const locked=document.body.getAttribute('style');expect(locked).toContain('width: 100%');
 const ad=requestRewardedAd(gpt,'/22639388115/rewarded_web_example',()=>{});
 act(()=>{handlers.get('rewardedSlotReady')?.({slot,makeRewardedVisible:()=>{const b=document.body.style;saved={overflow:b.overflow,position:b.position,top:b.top};b.position='fixed';b.removeProperty('width');window.history.pushState(null,'','#goog_rewarded');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));return true;}});ad.show();});
 expect(onClose).not.toHaveBeenCalled();expect(screen.getByRole('dialog')).toBeInTheDocument();
 act(()=>{restore();handlers.get('rewardedSlotGranted')?.({slot});handlers.get('rewardedSlotClosed')?.({slot});});
 expect(onClose).not.toHaveBeenCalled();expect(document.body.getAttribute('style')).toBe(locked);expect(window.location.hash).toBe('');
});
