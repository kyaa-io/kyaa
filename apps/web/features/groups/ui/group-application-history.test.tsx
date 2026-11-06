import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const answer=vi.hoisted(()=>({current:{}as unknown}));
vi.mock('./use-group-resource',()=>({useGroupResource:(_url:string,parse:(value:unknown)=>{items:unknown[];nextCursor:string|null})=>({authenticated:true,loading:false,error:false,ownerKey:'me',retry:vi.fn(),request:vi.fn(),data:parse(answer.current)})}));
vi.mock('./group-qualification',()=>({GroupQualificationForm:()=>null}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>null}));
import {GroupApplicationHistory} from './group-application-history';
afterEach(cleanup);
// Keys exactly as the applications operation returns them for an applicant (checked against the database).
const row={id:'e9500000-0000-4000-8000-000000000001',kind:'fan',name:'아이유',description:'소개',imageUrl:null,question:null,status:'rejected',reason:'공식 계정을 확인하지 못했어요',pageId:null,createdAt:'2026-11-07T00:00:00+00:00',qualification:{hasExistingPage:false},submissionRevision:1};
it('reads the applicant list as the server returns it and shows the reason',()=>{
 answer.current={items:[row],nextCursor:null};
 render(<GroupApplicationHistory locale='ko'/>);
 expect(screen.getByText('아이유')).toBeInTheDocument();
 expect(screen.getByText('반려')).toBeInTheDocument();
 expect(screen.getByText('공식 계정을 확인하지 못했어요')).toBeInTheDocument();
});
