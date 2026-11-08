import {fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupHeaderAccount} from './group-header-account';
const state=vi.hoisted(()=>({favorite:null as null|Record<string,unknown>,status:'empty',wallet:undefined as any,authenticated:true,logout:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/benefits',useSearchParams:()=>new URLSearchParams('locale=ko'),useRouter:()=>({replace:state.replace,push:vi.fn()})}));
vi.mock('./use-group-resource',()=>({GROUP_WALLET_CHANGED_EVENT:'wallet-changed',useGroupRequest:()=>({authenticated:state.authenticated,ready:true,ownerKey:state.authenticated?'u:0':'guest:0'}),useGroupResource:()=>({data:state.wallet,error:false,loading:false,retry:vi.fn()})}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({logout:state.logout,authenticated:state.authenticated,ready:true})}));
vi.mock('@/features/selected-bias/ui/use-selected-bias',()=>({useSelectedBias:()=>({status:state.status,options:[],selected:state.favorite,unverified:null,select:()=>{},retry:()=>{}})}));
vi.mock('@/features/profile/ui/use-avatar',()=>({useAvatar:()=>({state:{status:'none'}})}));
beforeEach(()=>{state.favorite=null;state.status='empty';state.wallet={points:1431,tickets:5};state.authenticated=true;state.logout=vi.fn().mockResolvedValue(undefined);state.replace=vi.fn();});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'계정 메뉴'}));
const favorite={slug:'ipyu',name:'이퓨',tier:'Bronze',stage:null,hearts:0};

it('B2: the avatar opens eight 48px rows — my state, MY, 패스포트, 친구·메시지, 설정, 언어, 팬페이지 개설, 로그아웃',async()=>{
 state.favorite=favorite;state.status='ready';
 render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const menu=await screen.findByRole('menu');
 const rows=within(menu).getAllByRole('menuitem');
 expect(rows).toHaveLength(8);
 expect(rows.map(row=>row.getAttribute('data-row'))).toEqual(Array(8).fill('menu'));
 expect(rows.slice(1).map(row=>row.textContent)).toEqual(['MY','패스포트','친구·메시지','설정','언어한국어','팬페이지 개설','로그아웃']);
 // First row: tier · favorite ♥N · P N, to the 덕질 tab; the heart is lucide filled, the coin a lucide line icon.
 const first=rows[0]!;
 expect(first).toHaveAttribute('href','/benefits?locale=ko');
 expect(first.textContent).toMatch(/이퓨/);
 expect(first.textContent).toContain('P 1,431');
 expect(first.querySelector('svg[data-icon="heart"]')).toHaveAttribute('fill','currentColor');
 expect(first.querySelector('svg[data-icon="coins"]')).toHaveAttribute('fill','none');
 expect(menu.querySelectorAll('svg[data-icon]:not([stroke-width="1.5"])')).toHaveLength(0);
 expect(rows[2]).toHaveAttribute('href','/passports?locale=ko');
 expect(rows[6]).toHaveAttribute('href','/pages/groups/apply?locale=ko');
});

it('without a favorite the first row asks to choose one and still shows the points',async()=>{
 render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const first=(await screen.findAllByRole('menuitem'))[0]!;
 expect(first.textContent).toContain('최애 고르기');
 expect(first.textContent).toContain('P 1,431');
 expect(first).toHaveAttribute('href','/pages/groups?locale=ko');
});

it('leaves the points out (no dash) while the wallet is unknown',async()=>{
 state.wallet=undefined;state.favorite=favorite;state.status='ready';
 render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 const first=(await screen.findAllByRole('menuitem'))[0]!;
 expect(first.textContent).not.toMatch(/P |—/);
});

it('로그아웃 signs out and goes to the login page',async()=>{
 render(<GroupHeaderAccount locale='ko' languageHref='/'/>);open();
 fireEvent.click(await screen.findByRole('menuitem',{name:'로그아웃'}));
 await vi.waitFor(()=>expect(state.replace).toHaveBeenCalledWith('/login?locale=ko'));
 expect(state.logout).toHaveBeenCalledTimes(1);
});

it('draws nothing signed out (the header shows a 로그인 word instead)',()=>{
 state.authenticated=false;
 const {container}=render(<GroupHeaderAccount locale='ko' languageHref='/'/>);
 expect(container.textContent).toBe('');
});
