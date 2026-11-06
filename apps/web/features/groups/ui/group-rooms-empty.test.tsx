import '@testing-library/jest-dom/vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({auth:false,canManage:false}));
const pageId='e9200000-0000-4000-8000-000000000003';
vi.mock('./group-page-context',()=>({useOptionalGroupPage:()=>({star:{state:'empty',label:'가입',onClick:vi.fn()},hrefFor:(tab:string)=>`/pages/groups/${pageId}?locale=ko&tab=${tab}`})}));
vi.mock('./use-group-resource',()=>({
 GroupRequestError:class extends Error{},
 useGroupRequest:()=>({request:vi.fn(),authenticated:h.auth,ready:true,ownerKey:'u'}),
 useGroupResource:(url:string|null)=>{
  if(url?.endsWith('/public-rooms'))return {data:{roomCount:0,items:[]},loading:false,error:false};
  if(url?.endsWith('/rooms'))return {data:{items:[],canManage:h.canManage},authenticated:h.auth,loading:false,error:false,request:vi.fn(),retry:vi.fn()};
  return {data:undefined,loading:false,error:false,authenticated:h.auth};
 },
}));
import {GroupRoomsPanel} from './group-rooms-panel';
afterEach(cleanup);
const panel=()=>render(<GroupRoomsPanel pageId={pageId} locale='ko'/>);
it('keeps the count, the empty card and a login for a guest',()=>{
 h.auth=false;panel();
 expect(screen.getByRole('heading',{name:/비밀방/})).toHaveTextContent('비밀방0');
 expect(screen.getByText('아직 열린 방이 없어요')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'로그인'})).toHaveAttribute('href',expect.stringMatching(/^\/login\?/));
});
it('leaves a joined fan with the board as the next step and the room creator with its own action',()=>{
 h.auth=true;h.canManage=false;const view=panel();
 expect(screen.getByRole('heading',{name:/비밀방/})).toHaveTextContent('비밀방0');
 expect(screen.getByRole('link',{name:'게시판'})).toHaveAttribute('href',`/pages/groups/${pageId}?locale=ko&tab=board`);
 view.unmount();
 h.canManage=true;panel();
 expect(screen.queryByRole('link',{name:'게시판'})).not.toBeInTheDocument();
});
