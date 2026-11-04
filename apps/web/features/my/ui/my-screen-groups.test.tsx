import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MyScreen } from './my-screen';
import { GroupsReleaseProvider } from '@/features/groups/ui/groups-release';
const data=vi.hoisted(()=>({
 summary:{profile:{nickname:'별빛'},creators:[{celebrity:{slug:'nchive',name:'엔카이브',image:'/nchive.jpg',isPublic:true},passport:{id:'passport-a',tier:'Silver',score:15,remainingToNextTier:35},ticketBalance:12},{celebrity:{slug:'unverified',name:'미인증 최애',image:null},passport:null,ticketBalance:0}],live:{upcoming:[],history:[]},rewards:{items:[],entries:0,availableCount:0},collection:{recent:[],stampCount:0,passportCount:1,collectibleCount:0},unreadNotificationCount:0},
 stamps:[{id:'stamp-a',kind:'welcome',celebritySlug:null,issuedAt:'2026-11-02T00:00:00Z'}],
}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:true,authenticated:true,user:{id:'owner-a'}})}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true})}));
vi.mock('@/components/fan-ui/use-owned-fan-resource',()=>({useOwnedFanResource:()=>({state:{status:'ready',data:data.summary},retry:vi.fn()})}));
vi.mock('@/features/profile/ui/use-avatar',()=>({useAvatar:()=>({state:{status:'loading'}})}));
vi.mock('@/features/community-stamps/ui/use-community-stamps',()=>({useCommunityStamps:()=>({state:{status:'ready',data:{stamps:data.stamps}},retry:vi.fn()})}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupResource:(url:string|null)=>({loading:false,error:null,data:url?.startsWith('/api/passports/')?{id:'10000000-0000-4000-8000-000000000001',stamps:[],activities:[],stampSummary:{total:0},firstReaction:null}:{points:375,hearts:4,tickets:9},retry:vi.fn()})}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>,FanContentContainer:({children}:{children:React.ReactNode})=><main>{children}</main>}));
it('uses the current MY composition with owned balances, issued favorites and earned stamps only',()=>{
 render(<GroupsReleaseProvider enabled><MyScreen locale='ko'/></GroupsReleaseProvider>);
 expect(screen.getByRole('heading',{level:1,name:'별빛님'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'내 패스포트'})).toBeInTheDocument();
 expect(screen.getByText('375P')).toBeInTheDocument();
 expect(screen.getByText('4개')).toBeInTheDocument();
 expect(screen.getByText('9장')).toBeInTheDocument();
 expect(screen.queryByText('240P')).not.toBeInTheDocument();
 expect(screen.queryByText('미인증 최애')).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'자세히 보기'})).toHaveAttribute('href','/passports/passport-a?locale=ko');
 expect(screen.getByRole('link',{name:'팬페이지 보기'})).toHaveAttribute('href','/nchive?locale=ko');
 expect(screen.getByRole('link',{name:/내 응모 내역/ })).toHaveAttribute('href','/my/raffles?locale=ko');
 const stamps=screen.getByRole('heading',{name:'함께 모은 도장'}).parentElement!;
 expect(within(stamps).getAllByRole('listitem')).toHaveLength(1);
 expect(stamps.querySelector('img')).toHaveAttribute('src',expect.stringContaining('welcome'));
 expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
it.each([['en','View fan page'],['ru','Посмотреть страницу фанатов'],['ja','ファンページを見る']] as const)('names the favorite row link as the fan page action in %s, not as the favorites heading',(locale,label)=>{
 render(<GroupsReleaseProvider enabled><MyScreen locale={locale}/></GroupsReleaseProvider>);
 expect(screen.getByRole('link',{name:label})).toHaveAttribute('href','/nchive?locale='+locale);
});
