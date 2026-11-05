import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {resetDukjilCatalogCache} from '@/features/dukjil/ui/dukjil-provider';
import {GroupHeaderAccount} from './group-header-account';
const state=vi.hoisted(()=>({wallet:undefined as any,request:undefined as any}));
vi.mock('./use-group-resource',()=>({GROUP_WALLET_CHANGED_EVENT:'wallet-changed',useGroupRequest:()=>({authenticated:true,ready:true,ownerKey:'u',request:state.request}),useGroupResource:()=>({data:state.wallet,error:false,loading:false,retry:vi.fn()})}));
vi.mock('@/features/profile/ui/use-avatar',()=>({useAvatar:()=>({state:{status:'none'}})}));
vi.mock('@/features/group-social/profile-connection',()=>({ProfileConnectionPanel:()=>null}));
beforeEach(()=>{resetDukjilCatalogCache();state.request=vi.fn().mockRejectedValue(new Error('no policy'));});
const wallet=(checkedIn:boolean,nextBonusIn=3)=>({points:500,tickets:0,attendance:{date:'2026-11-05',checkedIn,streak:1,nextBonusIn,days:[]}});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'계정 메뉴'}));
it('points header link goes to the benefits page, not My',()=>{
 state.wallet=wallet(true);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);
 expect(screen.getByRole('link',{name:/500/})).toHaveAttribute('href','/benefits?locale=ko');
});
it('shows the existing check-in payout in the menu until today is received',async()=>{
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 10P 받기'})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
});
it('uses the 7th-day bonus value and hides the entry once checked in',async()=>{
 state.wallet=wallet(false,1);const first=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 30P 받기'})).toBeInTheDocument();first.unmount();
 state.wallet=wallet(true);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 await new Promise(r=>setTimeout(r,20));
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();
});
it('hides the menu check-in entry before the reward start date or while writes are fenced',async()=>{
 state.wallet={...wallet(false),rewardsStartOn:'2026-11-06'};const first=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();first.unmount();
 state.wallet={...wallet(false),writeFenced:true};const second=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();second.unmount();
 state.wallet={...wallet(false),rewardsStartOn:'2026-11-05',writeFenced:false};render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 10P 받기'})).toBeInTheDocument();
});

it('under an active policy the menu shows a plain attendance item with no fixed points, and the legacy payout line is gone',async()=>{
 state.request=vi.fn().mockResolvedValue({version:1,rules:{checkin:{points:2,streakEvery:7,streakBonus:10}},missionBook:{}});
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const item=await screen.findByRole('menuitem',{name:'엔카이브 출석체크'});
 expect(item).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 expect(item.textContent).not.toMatch(/\d+\s?P/);
 await waitFor(()=>expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull());
});
it('an empty catalog keeps the legacy payout item',async()=>{
 state.request=vi.fn().mockResolvedValue({version:1,rules:{},missionBook:{}});
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 10P 받기'})).toBeInTheDocument();
});
it('while the policy is still loading neither the legacy payout nor the new attendance item is shown',async()=>{
 state.request=vi.fn().mockReturnValue(new Promise(()=>{}));
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();
 expect(screen.queryByRole('menuitem',{name:'엔카이브 출석체크'})).toBeNull();
});
