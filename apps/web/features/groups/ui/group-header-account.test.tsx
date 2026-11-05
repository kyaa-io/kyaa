import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupHeaderAccount} from './group-header-account';
const state=vi.hoisted(()=>({wallet:undefined as any}));
vi.mock('./use-group-resource',()=>({GROUP_WALLET_CHANGED_EVENT:'wallet-changed',useGroupRequest:()=>({authenticated:true,ready:true,ownerKey:'u'}),useGroupResource:()=>({data:state.wallet,error:false,loading:false,retry:vi.fn()})}));
vi.mock('@/features/profile/ui/use-avatar',()=>({useAvatar:()=>({state:{status:'none'}})}));
vi.mock('@/features/group-social/profile-connection',()=>({ProfileConnectionPanel:()=>null}));
const wallet=(checkedIn:boolean,nextBonusIn=3)=>({points:500,hearts:0,tickets:0,attendance:{date:'2026-11-05',checkedIn,streak:1,nextBonusIn,days:[]}});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'계정 메뉴'}));
it('points header link goes to the benefits page, not My',()=>{
 state.wallet=wallet(true);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);
 expect(screen.getByRole('link',{name:/500/})).toHaveAttribute('href','/benefits?locale=ko');
});
it('shows the existing check-in payout in the menu until today is received',()=>{
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.getByRole('menuitem',{name:'출석하고 10P 받기'})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
});
it('uses the 7th-day bonus value and hides the entry once checked in',()=>{
 state.wallet=wallet(false,1);const first=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.getByRole('menuitem',{name:'출석하고 30P 받기'})).toBeInTheDocument();first.unmount();
 state.wallet=wallet(true);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();
});
it('hides the menu check-in entry before the reward start date or while writes are fenced',()=>{
 state.wallet={...wallet(false),rewardsStartOn:'2026-11-06'};const first=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();first.unmount();
 state.wallet={...wallet(false),writeFenced:true};const second=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();second.unmount();
 state.wallet={...wallet(false),rewardsStartOn:'2026-11-05',writeFenced:false};render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.getByRole('menuitem',{name:'출석하고 10P 받기'})).toBeInTheDocument();
});
