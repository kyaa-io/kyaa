import type {ReactNode} from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GroupEarningResult} from './group-earning-result';
const state=vi.hoisted(()=>({entry:{entryKey:'activity:10000000-0000-4000-8000-000000000001',kind:'activity',activityKey:'unknown',title:null,status:'corrected',asset:'fan_point',originalAmount:37,correctionAmount:-37,netAmount:0,reason:null,occurredAt:'2026-11-01T00:00:00Z',processedAt:null,activityHref:null}}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('./group-activity-header',()=>({GroupActivityHeader:()=>null}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({ready:true,authenticated:true}),useGroupResource:(_url:string,parse:(v:unknown)=>unknown)=>({ready:true,authenticated:true,data:parse({entry:state.entry}),loading:false,error:false})}));
afterEach(cleanup);
it('preserves null reason/time and cursor without inventing cancellation or zero amounts',()=>{
 render(<GroupEarningResult pageId='10000000-0000-4000-8000-000000000001' entryKey={state.entry.entryKey} locale='ko' cursor='opaque+/='/ >);
 expect(screen.getByRole('heading',{name:'적립 정정'})).toBeInTheDocument();
 expect(screen.getByText('정정 사유 미제공')).toBeInTheDocument();
 expect(screen.getByText('정보 없음')).toBeInTheDocument();
 expect(screen.getByText('활동 참여')).toBeInTheDocument();
 expect(screen.queryByText(/0P|2026|출석|댓글/)).toBeNull();
 expect(screen.getByRole('link',{name:'적립 내역으로'})).toHaveAttribute('href','/pages/groups/10000000-0000-4000-8000-000000000001/earnings?locale=ko&cursor=opaque%2B%2F%3D');
});
