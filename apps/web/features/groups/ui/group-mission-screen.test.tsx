import type {ReactNode} from 'react';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupMissionsOverview} from './group-mission-screen';
const state=vi.hoisted(()=>({next:false,failed:false,retry:vi.fn()}));
const pageId='10000000-0000-4000-8000-000000000001';
const photo={id:pageId,title:'응원 사진 남기기',instructions:'엔카이브 응원 사진을 올려주세요.',imageUrl:'/images/groups/nchive-group.webp',state:'published',revision:1,rewardPoints:20,status:'pending',actionHref:'/?view=mission-detail&mission=photo'};
const survey={...photo,id:'10000000-0000-4000-8000-000000000002',title:'오늘의 설문',instructions:'설문에 답해 주세요.',imageUrl:null,status:'completed',actionHref:'/?view=mission-detail&mission=survey'};
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null)=>{
 const common={ownerKey:'viewer',authenticated:true,error:false,loading:false,retry:state.retry};
 if(url?.includes('/missions'))return {...common,error:state.failed,data:state.failed?undefined:{missions:url.includes('cursor=')?[survey]:[photo],nextCursor:url.includes('cursor=')?null:survey.id}};
 if(url==='/api/me/wallet')return {...common,data:{attendance:{checkedIn:false}}};
 return {...common,data:{page:{id:pageId,name:'엔카이브',slug:'nchive',celebrityId:pageId},membership:{role:'member'}}};
}}));
beforeEach(()=>{state.failed=false;state.retry.mockReset();});
afterEach(cleanup);
it('renders the source overview with actual mission content, participation status, and existing destinations',()=>{
 render(<GroupMissionsOverview pageId={pageId} locale='ko' creatorName='엔카이브' header={<h1>엔카이브 팬페이지</h1>} missionLabels={{[photo.id]:{category:'사진 인증',action:'인증하기'}}}/>);
 expect(screen.getByRole('heading',{name:'오늘의 덕질'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'출석체크'})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 expect(document.querySelector('img[src="/images/groups/mission-attendance.png"]')).toBeInTheDocument();
 expect(screen.getByText('사진 인증')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'인증하기'})).toHaveAttribute('href','/?view=mission-detail&mission=photo&locale=ko');
 const history=screen.getByRole('heading',{name:'내 참여 내역'}).closest('section')!;
 expect(within(history).getByText('검토 중')).toBeInTheDocument();
 expect(screen.queryByText('참여 완료')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'더 보기'}));
 expect(screen.getByRole('heading',{name:'오늘의 설문'})).toBeInTheDocument();
 expect(within(history).getByText('참여 완료')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'더 보기'})).toBeNull();
});
it('offers retry when the existing mission list fails',()=>{
 state.failed=true;
 render(<GroupMissionsOverview pageId={pageId} locale='en'/>);
 expect(screen.getByRole('alert')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Try again'}));
 expect(state.retry).toHaveBeenCalledOnce();
});
