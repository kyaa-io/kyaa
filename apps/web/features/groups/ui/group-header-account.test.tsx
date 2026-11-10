import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {resetDukjilCatalogCache} from '@/features/dukjil/ui/dukjil-provider';
import {GroupHeaderAccount,GroupHeaderPoints} from './group-header-account';
const state=vi.hoisted(()=>({favorite:null as null|{name:string},wallet:undefined as any,request:undefined as any,failure:undefined as any,retry:undefined as any}));
vi.mock('next/navigation',()=>({usePathname:()=>'/benefits',useSearchParams:()=>new URLSearchParams('locale=ko')}));
vi.mock('./use-group-resource',()=>({GROUP_WALLET_CHANGED_EVENT:'wallet-changed',useGroupRequest:()=>({authenticated:true,ready:true,ownerKey:'u',request:state.request}),useGroupResource:(url:string)=>({data:url==='/api/me/profile'?{profile:{nickname:"아리가또아리가또아리가또아리가또"}}:state.wallet,error:Boolean(state.failure),failure:state.failure,loading:false,retry:state.retry??vi.fn()})}));
vi.mock('@/features/selected-bias/ui/use-selected-bias',()=>({useSelectedBias:()=>({status:state.favorite?'ready':'empty',options:[],selected:state.favorite,unverified:null,select:()=>{},retry:()=>{}})}));
vi.mock('@/features/profile/ui/use-avatar',()=>({useAvatar:()=>({state:{status:'none'}})}));
vi.mock('@/features/group-social/profile-connection',()=>({ProfileConnectionPanel:({identity}:{identity:React.ReactNode})=><div role='dialog'>{identity}</div>}));
beforeEach(()=>{resetDukjilCatalogCache();state.favorite=null;state.failure=undefined;state.retry=undefined;state.request=vi.fn().mockRejectedValue(new Error('no policy'));});
const wallet=(checkedIn:boolean,nextBonusIn=3)=>({points:500,tickets:0,attendance:{date:'2026-11-05',checkedIn,streak:1,nextBonusIn,days:[]}});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'계정 메뉴'}));
it('points header link goes to the benefits page, not My',()=>{
 state.wallet=wallet(true);render(<GroupHeaderPoints locale='ko'/>);
 expect(screen.getByRole('link',{name:/500/})).toHaveAttribute('href','/benefits?locale=ko');
});
it('an expired session turns the points slot into a sign-in link instead of a dash',()=>{
 state.wallet=undefined;state.failure={status:401,code:'AUTH_REQUIRED'};render(<GroupHeaderPoints locale='ko'/>);
 const link=screen.getByRole('link',{name:'로그인'});
 expect(link.getAttribute('href')).toContain('/login');
 expect(screen.queryByText('—')).toBeNull();
});
it('a failed wallet read offers a retry instead of a dash',()=>{
 state.wallet=undefined;state.failure={status:503,code:'UNAVAILABLE'};state.retry=vi.fn();render(<GroupHeaderPoints locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'포인트 · 다시 시도'}));
 expect(state.retry).toHaveBeenCalledTimes(1);
 expect(screen.queryByText('—')).toBeNull();
});
it('shows the check-in entry in the menu until today is received',async()=>{
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 포인트 받기'})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
});
it('names no amount on the 7th day and hides the entry once checked in',async()=>{
 state.wallet=wallet(false,1);const first=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 포인트 받기'})).toBeInTheDocument();first.unmount();
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
 expect(await screen.findByRole('menuitem',{name:'출석하고 포인트 받기'})).toBeInTheDocument();
});

it('under an active policy the menu shows a plain attendance item with no fixed points, and the legacy payout line is gone',async()=>{
 state.request=vi.fn().mockResolvedValue({version:1,rules:{checkin:{points:2,streakEvery:7,streakBonus:10}},missionBook:{}});
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const item=await screen.findByRole('menuitem',{name:'출석체크'});
 expect(item).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 expect(item.textContent).not.toMatch(/\d+\s?P/);
 await waitFor(()=>expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull());
});
it('an empty catalog keeps the legacy payout item',async()=>{
 state.request=vi.fn().mockResolvedValue({version:1,rules:{},missionBook:{}});
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(await screen.findByRole('menuitem',{name:'출석하고 포인트 받기'})).toBeInTheDocument();
});
it('while the policy is still loading neither the legacy payout nor the new attendance item is shown',async()=>{
 state.request=vi.fn().mockReturnValue(new Promise(()=>{}));
 state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 expect(screen.queryByRole('menuitem',{name:/출석하고/})).toBeNull();
 expect(screen.queryByRole('menuitem',{name:/출석체크/})).toBeNull();
});
it('signed in, the avatar is the one account-menu trigger and the menu has no 알림 item (feedback F)',async()=>{
 state.wallet=wallet(true);const {container}=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);
 const trigger=screen.getByRole('button',{name:'계정 메뉴'});
 expect(trigger).toHaveAttribute('data-account-trigger','avatar');
 expect(container.querySelectorAll('button').length).toBe(1);
 open();
 expect(await screen.findByRole('menuitem',{name:/언어 설정/})).toHaveTextContent('한국어');
 expect(screen.queryByRole('menuitem',{name:'알림'})).toBeNull();
 expect(screen.getAllByRole('menuitem').length).toBe(6);
});
it('r6 H1: the attendance item names the fan\'s own favorite page, and no fixed page name appears for anyone',async()=>{
 state.request=vi.fn().mockResolvedValue({version:1,rules:{checkin:{points:2,streakEvery:7,streakBonus:10}},missionBook:{}});
 state.favorite={name:'[시험] 랭킹 확인 페이지'};state.wallet=wallet(false);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const item=await screen.findByRole('menuitem',{name:'[시험] 랭킹 확인 페이지 출석체크'});
 expect(item).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 expect(document.body.textContent).not.toContain('엔카이브');
});

it('shows the full nickname accessibly in the truncated account menu and profile', async()=>{
 state.wallet=wallet(true);render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const item=await screen.findByRole('menuitem',{name:'아리가또아리가또아리가또아리가또'});
 expect(item.querySelector('span:last-child')).toHaveStyle({textOverflow:'ellipsis',whiteSpace:'nowrap'});
 fireEvent.click(item);
 expect(await screen.findByRole('dialog')).toHaveTextContent('아리가또아리가또아리가또아리가또');
});
