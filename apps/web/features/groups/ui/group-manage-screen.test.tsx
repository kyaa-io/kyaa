import { fireEvent,render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { GroupManageScreen } from './group-manage-screen';
import { operatorToolsCopy } from './operator-tools-copy';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'member'},getAccessToken:async()=>'token'}));
const nav=vi.hoisted(()=>({search:new URLSearchParams()}));
vi.mock('next/navigation',async importOriginal=>({...await importOriginal<typeof import('next/navigation')>(),useRouter:()=>({push:vi.fn(),replace:vi.fn()}),useSearchParams:()=>nav.search}));
vi.mock('./group-management',()=>({GroupManagement:({section}:{section:string})=><p data-testid='section'>{section}</p>}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'member',generation:0})}));
it('does not mount management data reads for a regular member',async()=>{
 const id='10000000-0000-4000-8000-000000000001',urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json({page:{id,kind:'hobby',celebrityId:null,slug:null,name:'함께 달려요',description:'우리 모임',imageUrl:null,question:null,memberCount:2},membership:{role:'member',joinedAt:'2026-11-01T10:00:00Z'},bookmarked:false});}));
 render(<GroupManageScreen pageId={id} locale='ko'/>);await screen.findByRole('heading',{name:'운영진만 볼 수 있어요'});expect(urls.filter(url=>url.startsWith('/api/groups'))).toEqual([`/api/groups/${id}`]);expect(screen.queryByRole('navigation',{name:'페이지 운영'})).not.toBeInTheDocument();expect(screen.getByText('함께 달려요')).toBeInTheDocument();expect(screen.queryByText(/소유자|운영진 \//)).not.toBeInTheDocument();
});

const ownerDetail=(id:string)=>Response.json({page:{id,kind:'hobby',celebrityId:null,slug:null,name:'함께 달려요',description:'우리 모임',imageUrl:null,question:null,memberCount:2},membership:{role:'owner',joinedAt:'2026-11-01T10:00:00Z'},bookmarked:false});
it('follows the section in the address when a link changes it on the already open screen',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 vi.stubGlobal('fetch',vi.fn(async()=>ownerDetail(id)));
 nav.search=new URLSearchParams('section=members');
 const view=render(<GroupManageScreen pageId={id} locale='ko' initialSection='members'/>);
 const tabs=await screen.findByRole('navigation',{name:'페이지 운영'});
 expect(screen.getByTestId('section')).toHaveTextContent('members');
 fireEvent.click(Array.from(tabs.querySelectorAll('a')).find(a=>a.getAttribute('href')?.endsWith('section=settings'))!);
 expect(screen.getByTestId('section')).toHaveTextContent('settings');
 nav.search=new URLSearchParams('section=settings');
 view.rerender(<GroupManageScreen pageId={id} locale='ko' initialSection='members'/>);
 nav.search=new URLSearchParams('section=members');
 view.rerender(<GroupManageScreen pageId={id} locale='ko' initialSection='members'/>);
 expect(screen.getByTestId('section')).toHaveTextContent('members');
 expect(screen.getByRole('link',{name:operatorToolsCopy('ko').tab})).toHaveAttribute('aria-current','page');
});
