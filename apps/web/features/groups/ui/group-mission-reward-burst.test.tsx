import type {ReactNode} from 'react';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GroupMissionScreen} from './group-mission-screen';
// Synthetic state stub: the own submission turns from pending to completed with a server rewardPoints.
const state=vi.hoisted(()=>({status:'pending' as string}));
const base={id:'m1',title:'사진 인증',instructions:'올려 주세요',imageUrl:null,state:'published',revision:1,rewardPoints:20,submissionKind:'text',surveyQuestion:null,surveyOptions:null};
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useSearchParams:()=>new URLSearchParams('view=submission')}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('./group-activity-header',()=>({GroupActivityHeader:()=>null}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:()=>null}));
vi.mock('./use-group-resource',()=>({GroupRequestError:class extends Error{},useGroupResource:(url:string|null)=>({ownerKey:'v',authenticated:true,error:false,loading:false,retry:vi.fn(),request:vi.fn(),data:url?.includes('/missions/')&&!url.includes('submissions')?{mission:base,canSubmit:false,canReview:false,submission:{id:'s1',status:state.status,body:'본문',imageUrl:null,reason:null,rewardPoints:20,currentRevision:1,surveyResponse:null,history:[]}}:undefined})}));
afterEach(cleanup);
it('plays the server reward once when the own submission turns completed, not on first load',()=>{
 state.status='completed';
 const first=render(<GroupMissionScreen pageId='p' missionId='m1' locale='ko' view='submission'/>);
 expect(screen.queryByTestId('point-reward-burst')).toBeNull();
 first.unmount();
 state.status='pending';
 const {rerender}=render(<GroupMissionScreen pageId='p' missionId='m1' locale='ko' view='submission'/>);
 expect(screen.queryByTestId('point-reward-burst')).toBeNull();
 state.status='completed';
 act(()=>rerender(<GroupMissionScreen pageId='p' missionId='m1' locale='ko' view='submission'/>));
 expect(screen.getByTestId('point-reward-burst').textContent).toContain('+20');
 expect(screen.getAllByRole('status').length).toBe(1);
});
