import { render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { groupsCopy } from "./copy";
import { GroupImage } from './group-image';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'private-token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
beforeEach(()=>{auth.authenticated=true;auth.getAccessToken.mockClear();session.ownerId='owner-a';session.generation=0;Object.defineProperty(URL,'createObjectURL',{value:vi.fn(()=> 'blob:authorized-image'),configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:vi.fn(),configurable:true});});
it('loads a draft group image with its bearer and revokes the private blob',async()=>{
 const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(new Blob(['image'],{type:'image/png'})));vi.stubGlobal('fetch',fetch);
 const view=render(<GroupImage locale='ko' src='/api/groups/images/10000000-0000-4000-8000-000000000001' alt='행사 사진'/>);await waitFor(()=>expect(screen.getByRole('img',{name:'행사 사진'})).toHaveAttribute('src','blob:authorized-image'));expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({Authorization:'Bearer private-token'});view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:authorized-image');
});
it('does not pass a public external URL to the authenticated reader',()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<GroupImage locale='ko' src='https://example.com/api/groups/images/image.png' alt='외부 사진'/>);expect(screen.getByRole('img',{name:'외부 사진'})).toHaveAttribute('src','https://example.com/api/groups/images/image.png');expect(fetch).not.toHaveBeenCalled();
});
it('removes the prior owner image immediately when the session changes',async()=>{
 const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(new Blob(['image'],{type:'image/png'})));vi.stubGlobal('fetch',fetch);const view=render(<GroupImage locale='ko' src='/api/groups/images/10000000-0000-4000-8000-000000000001' alt='비공개 사진'/>);await screen.findByRole('img',{name:'비공개 사진'});session.ownerId='owner-b';session.generation++;fetch.mockImplementation(async()=>new Response(null,{status:403}));view.rerender(<GroupImage locale='ko' src='/api/groups/images/10000000-0000-4000-8000-000000000001' alt='비공개 사진'/>);expect(screen.queryByRole('img',{name:'비공개 사진'})).not.toBeInTheDocument();await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:authorized-image'));
});

it('keeps a guest-denied image hidden and sends no bearer',async()=>{
 auth.authenticated=false;const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(null,{status:404}));vi.stubGlobal('fetch',fetch);render(<GroupImage locale='ko' src='/api/groups/images/10000000-0000-4000-8000-000000000001' alt='회원 사진'/>);await screen.findByRole('img',{name:groupsCopy('ko').error});expect(screen.queryByRole('img',{name:'회원 사진'})).not.toBeInTheDocument();expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');expect(auth.getAccessToken).not.toHaveBeenCalled();
});
