import '@testing-library/jest-dom/vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupOperatorNotices} from './group-operator-notices';
import {GroupOperatorStats} from './group-operator-stats';

const pageId='e9200000-0000-4000-8000-000000000003';
const post=(n:number)=>({id:`e9200000-0000-4000-8000-0000000001${String(n).padStart(2,'0')}`,pageId,title:`공지 ${n}`,body:`본문 ${n}`,visibility:'public',anonymous:false,profileId:null,nickname:'운영',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'});
const urls:string[]=[];
const request=vi.fn();
const retry=vi.fn();
let responses:Record<string,unknown>={};
vi.mock('./use-group-resource',async()=>{
 const react=await import('react');
 return {
  useGroupRequest:()=>({request,ownerKey:'owner'}),
  useGroupResource:(url:string,parse:(v:unknown)=>unknown)=>{urls.push(url);const raw=responses[url];return {ownerKey:'owner',data:raw?parse(raw):undefined,error:false,loading:!raw,retry:react.useCallback(()=>retry(),[])};},
 };
});
beforeEach(()=>{urls.length=0;request.mockReset();request.mockResolvedValue({removed:true});retry.mockReset();});
afterEach(()=>{responses={};});

it('loads further notices with the cursor and keeps the earlier ones',async()=>{
 const first=`/api/groups/${pageId}/posts?category=notice&limit=50`;
 responses={[first]:{items:[post(1),post(2)],nextCursor:'e9200000-0000-4000-8000-000000000999'},[`${first}&cursor=e9200000-0000-4000-8000-000000000999`]:{items:[post(3)],nextCursor:null}};
 render(<GroupOperatorNotices pageId={pageId} locale="ko"/>);
 expect(screen.getAllByRole('heading',{level:3})).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'더 보기'}));
 await waitFor(()=>expect(screen.getAllByRole('heading',{level:3})).toHaveLength(3));
 expect(urls).toContain(`${first}&cursor=e9200000-0000-4000-8000-000000000999`);
 expect(screen.queryByRole('button',{name:'더 보기'})).not.toBeInTheDocument();
});

it('keeps the loaded notices and disables the button while the next page is pending',async()=>{
 const first=`/api/groups/${pageId}/posts?category=notice&limit=50`;
 responses={[first]:{items:[post(1),post(2)],nextCursor:'e9200000-0000-4000-8000-000000000999'}};
 render(<GroupOperatorNotices pageId={pageId} locale="ko"/>);
 fireEvent.click(screen.getByRole('button',{name:'더 보기'}));
 expect(screen.getAllByRole('heading',{level:3})).toHaveLength(2);
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'더 보기'})).toBeDisabled();
});


it('gives each daily bar a text name instead of labelling an element without a role',()=>{
 responses={[`/api/groups/${pageId}/stats?days=7`]:{days:7,from:'2026-10-26',to:'2026-11-01',members:3,joinedInPeriod:1,posts:2,postsInPeriod:1,notices:1,visitors:2,visitDays:3,daily:[{day:'2026-10-26',visitors:2},{day:'2026-10-27',visitors:0}]}};
 const {container}=render(<GroupOperatorStats pageId={pageId} locale="ko"/>);
 expect(container.querySelectorAll('i[aria-label]')).toHaveLength(0);
 expect(screen.getByText('2026-10-26 2')).toBeInTheDocument();
});
