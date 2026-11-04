import { render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { GroupManageScreen } from './group-manage-screen';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'member'},getAccessToken:async()=>'token'}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'member',generation:0})}));
it('does not mount management data reads for a regular member',async()=>{
 const id='10000000-0000-4000-8000-000000000001',urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json({page:{id,kind:'hobby',celebrityId:null,slug:null,name:'함께 달려요',description:'우리 모임',imageUrl:null,question:null,memberCount:2},membership:{role:'member',joinedAt:'2026-11-01T10:00:00Z'},bookmarked:false});}));
 render(<GroupManageScreen pageId={id} locale='ko'/>);await screen.findByRole('heading',{name:'운영진만 볼 수 있어요'});expect(urls.filter(url=>url.startsWith('/api/groups'))).toEqual([`/api/groups/${id}`]);expect(screen.queryByRole('navigation',{name:'페이지 운영'})).not.toBeInTheDocument();expect(screen.getByText('함께 달려요')).toBeInTheDocument();expect(screen.queryByText(/소유자|운영진 \//)).not.toBeInTheDocument();
});
