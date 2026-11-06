import '@testing-library/jest-dom/vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {parseFanPageTab} from '@/features/fanpage/domain/board-navigation';
import {GroupActivitiesPanel} from './group-activities';
import {GroupManageScreen} from './group-manage-screen';
import {groupsCopy} from './copy';
const id='e9200000-0000-4000-8000-000000000001',calls:string[]=[];
const nav=vi.hoisted(()=>({search:new URLSearchParams()}));
vi.mock('next/navigation',async importOriginal=>({...await importOriginal<typeof import('next/navigation')>(),usePathname:()=>'/studio',useSearchParams:()=>nav.search,useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
vi.mock('./group-management',()=>({GroupManagement:({section}:{section:string})=><p data-testid='section'>{section}</p>}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken:async()=>'token'}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
const page={id,kind:'brand',celebrityId:null,slug:null,name:'모임',description:'',imageUrl:null,question:null,memberCount:2};
beforeEach(()=>{calls.length=0;nav.search=new URLSearchParams();vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);return Response.json(url.endsWith('/activities')?{certificationHref:null,missions:[],events:[],raffles:[]}:url.includes('/collections')?{items:[],canManage:false,nextCursor:null}:url.includes('/events')?{events:[],canManage:false,nextCursor:null}:{page,membership:{role:'owner',joinedAt:'2026-11-01T10:00:00Z'},bookmarked:false});}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const label=groupsCopy('ko').collection;

it('leaves the collection out of the manage tabs',async()=>{
 render(<GroupManageScreen pageId={id} locale='ko'/>);
 const tabs=await screen.findByRole('navigation',{name:'페이지 운영'});
 expect(tabs.textContent).not.toContain(label);
 expect(tabs.querySelector('a[href*="section=collection"]')).toBeNull();
});
it('opens the first manage tab when the address still asks for the collection',async()=>{
 nav.search=new URLSearchParams('section=collection');
 render(<GroupManageScreen pageId={id} locale='ko' initialSection='collection'/>);
 expect(await screen.findByTestId('section')).toHaveTextContent('members');
});
it('draws no collection button in the activity hub',async()=>{
 render(<GroupActivitiesPanel pageId={id} locale='ko' pageName='모임'/>);
 await screen.findByRole('heading',{name:groupsCopy('ko').activities});
 expect(screen.queryByRole('link',{name:label})).toBeNull();
});
it('shows the hub instead of the list for an old activity address and reads no products',async()=>{
 nav.search=new URLSearchParams('activity=collection');
 render(<GroupActivitiesPanel pageId={id} locale='ko' pageName='모임'/>);
 await screen.findByRole('heading',{name:groupsCopy('ko').activities});
 await waitFor(()=>expect(calls.some(url=>url.includes('/collections'))).toBe(false));
});
it('turns an old fan page collection address into the home tab',()=>{
 expect(parseFanPageTab('collection')).toBe('home');
 expect(parseFanPageTab('activities')).toBe('activities');
});
