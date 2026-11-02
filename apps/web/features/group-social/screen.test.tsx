import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({ownerKey:'a',authenticated:true,request:vi.fn(),resource:vi.fn(),uploads:{items:[] as any[],ready:false,busy:false,invalid:false,add:vi.fn(),remove:vi.fn(),markUsed:vi.fn(),retry:vi.fn()}}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({GroupRequestError:class extends Error{constructor(readonly status:number,readonly code:string){super(code);}},useGroupRequest:()=>({...mock,ready:true}),useGroupResource:(url:string|null)=>({...mock,ready:true,...mock.resource(url),retry:vi.fn()})}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@/components/fan-ui/fan-action',()=>({FanAction:({children,href,onClick,disabled,type,ariaLabel}:{children:React.ReactNode;href?:string;onClick?:()=>void;disabled?:boolean;type?:'button'|'submit';ariaLabel?:string})=>href?<a href={href}>{children}</a>:<button aria-label={ariaLabel} type={type??'button'} disabled={disabled} onClick={onClick}>{children}</button>}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>mock.uploads}));
vi.mock('@/features/content-safety/ui/authenticated-media',()=>({AuthenticatedMedia:({alt}:{alt:string})=><img alt={alt}/> }));
import { GroupRequestError } from '@/features/groups/ui/use-group-resource';
import { GroupSocialScreen } from './screen';
const person='10000000-0000-4000-8000-000000000001';
beforeEach(()=>{mock.uploads.items=[];mock.uploads.ready=false;mock.uploads.invalid=false;mock.ownerKey='a';mock.authenticated=true;mock.request.mockReset().mockResolvedValue({});mock.resource.mockReset().mockImplementation((url:string|null)=>({data:url?.includes('/friends?')?{friendships:[]}:url?.endsWith('/conversations')?{conversations:[]}:undefined,loading:false,error:false}));});
describe('web friend and message boundaries',()=>{
 it('offers login without inventing authenticated rows',()=>{mock.authenticated=false;render(<GroupSocialScreen locale="ko"/>);expect(screen.getByRole('link',{name:'로그인'})).toBeTruthy();expect(mock.request).not.toHaveBeenCalled();});
 it('resolves an actual incoming request using its stable identity',async()=>{mock.resource.mockImplementation((url:string)=>({data:url?.includes('/friends?')?{friendships:[{id:person,profileId:person,nickname:'Real member',avatarUrl:null,status:'incoming'}]}:undefined,loading:false,error:false}));render(<GroupSocialScreen locale="ko" friendFilter='incoming'/>);fireEvent.click(screen.getByRole('button',{name:'수락'}));await waitFor(()=>expect(mock.request).toHaveBeenCalled());const [url,options]=mock.request.mock.calls[0];expect(url).toBe(`/api/me/social/friends/${person}`);expect(options.method).toBe('PATCH');expect(JSON.parse(options.body)).toMatchObject({action:'accept',requestId:expect.any(String)});});
 it('clears private message drafts when account ownership changes',async()=>{mock.resource.mockImplementation((url:string)=>({data:url?.includes('/profiles/')?{profile:{id:person,nickname:'Member',avatarUrl:null},relationship:{friendshipId:null,status:'none'},dm:{conversationId:null,status:'none',canSend:false},capabilities:{canRequestFriend:true,canRequestDm:true,canBlock:true}}:undefined,loading:false,error:false}));const view=render(<GroupSocialScreen locale="ko" profileId={person}/>);const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'Private draft'}});expect((input as HTMLTextAreaElement).value).toBe('Private draft');mock.ownerKey='b';view.rerender(<GroupSocialScreen locale="ko" profileId={person}/>);await waitFor(()=>expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''));});
 it('keeps failed first-message input and retry identity',async()=>{mock.resource.mockImplementation((url:string)=>({data:url?.includes('/profiles/')?{profile:{id:person,nickname:'Member',avatarUrl:null},relationship:{friendshipId:null,status:'none'},dm:{conversationId:null,status:'none',canSend:false},capabilities:{canRequestFriend:true,canRequestDm:true,canBlock:true}}:undefined,loading:false,error:false}));mock.request.mockRejectedValue(new Error('network'));render(<GroupSocialScreen locale="ko" profileId={person}/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:'Hello'}});fireEvent.click(screen.getByRole('button',{name:'대화 요청'}));await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Hello');fireEvent.click(screen.getByRole('button',{name:'대화 요청'}));await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(2));expect(JSON.parse(mock.request.mock.calls[0][1].body).requestId).toBe(JSON.parse(mock.request.mock.calls[1][1].body).requestId);});
 it('clears cached messages and composer when access is revoked',async()=>{mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/conversations')?{conversations:[{id:person,profileId:person,nickname:'Member',avatarUrl:null,status:'accepted',canSend:true,latestMessage:null}]}:undefined,loading:false,error:false}));mock.request.mockResolvedValueOnce({messages:[{id:person,senderProfileId:person,text:'Private cached message',createdAt:'2026-11-01T00:00:00Z',isMine:false}]}).mockRejectedValue(new GroupRequestError(403,'SOCIAL_FORBIDDEN'));render(<GroupSocialScreen locale="ko" conversationId={person}/>);await waitFor(()=>expect(screen.getByText('Private cached message')).toBeTruthy());await waitFor(()=>expect(screen.queryByText('Private cached message')).toBeNull(),{timeout:5000});expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByRole('alert')).toHaveTextContent('메시지를 보낼 수 없어요.');const conversation=screen.getByRole('alert').closest('section')!;expect(within(conversation).queryByText('첫 메시지를 보내보세요.')).not.toBeInTheDocument();expect(within(conversation).queryByText('처리하지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument();});

});
it('saves explicit favorite visibility using only the passport-owned list',async()=>{
 mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/settings')?{profileVisible:true,favoriteSlugs:[],dmPolicy:'requests'}:url?.startsWith('/api/groups?')?{items:[{id:person,kind:'fan',celebrityId:person,slug:'nchive',name:'엔카이브 팬페이지',description:'',imageUrl:null,question:null,memberCount:100}],nextCursor:null}:undefined,loading:false,error:false}));
 render(<GroupSocialScreen locale='ko'/>);fireEvent.click(screen.getByRole('button',{name:'설정'}));fireEvent.click(screen.getByRole('checkbox',{name:'엔카이브 팬페이지'}));fireEvent.click(screen.getByRole('button',{name:'설정 저장'}));await waitFor(()=>expect(mock.request).toHaveBeenCalledWith('/api/me/social/settings',expect.objectContaining({method:'PATCH'})));expect(JSON.parse(mock.request.mock.calls[0][1].body)).toMatchObject({profileVisible:true,favoriteSlugs:['nchive'],dmPolicy:'requests'});
});
it('replaces a blocked profile with its blocked state and removes the request composer',async()=>{
 mock.resource.mockImplementation((url:string)=>({data:url?.includes('/profiles/')?{profile:{id:person,nickname:'Member',avatarUrl:null},relationship:{friendshipId:null,status:'none'},dm:{conversationId:null,status:'none',canSend:false},capabilities:{canRequestFriend:true,canRequestDm:true,canBlock:true}}:undefined,loading:false,error:false}));
 render(<GroupSocialScreen locale='ko' profileId={person}/>);fireEvent.click(screen.getByRole('button',{name:'차단'}));await screen.findByRole('heading',{name:'차단한 사용자'});expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByRole('button',{name:'친구 요청'})).toBeNull();
});

it('distinguishes an incoming message request from an incoming friend request',()=>{
 mock.resource.mockImplementation((url:string)=>({data:url?.includes('/friends?')?{friendships:[{id:person,profileId:person,nickname:'Friend',avatarUrl:null,status:'incoming'}]}:url?.endsWith('/conversations')?{conversations:[{id:person,profileId:person,nickname:'Chat',avatarUrl:null,status:'incoming_request',canSend:false,latestMessage:null}]}:undefined,loading:false,error:false}));
 render(<GroupSocialScreen locale='ko' friendFilter='incoming'/>);expect(screen.getByText('받은 친구 요청')).toBeInTheDocument();expect(screen.getByText('받은 대화 요청')).toBeInTheDocument();
});

it('blocks the selected conversation through the existing API and removes its composer',async()=>{
 mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/conversations')?{conversations:[{id:person,profileId:person,nickname:'Member',avatarUrl:null,status:'accepted',canSend:true,latestMessage:null}]}:undefined,loading:false,error:false}));
 mock.request.mockImplementation((url:string)=>Promise.resolve(url.endsWith('/messages?limit=100')?{messages:[]}:{}));
 render(<GroupSocialScreen locale='ko' conversationId={person}/>);
 fireEvent.click(screen.getByRole('button',{name:'Member 차단'}));fireEvent.click(screen.getByRole('button',{name:'차단'}));
 await screen.findByRole('heading',{name:'차단한 사용자'});
 expect(screen.queryByRole('textbox')).toBeNull();
 expect(mock.request).toHaveBeenCalledWith('/api/me/social/blocks',expect.objectContaining({method:'POST'}));
});
it('renders local media and sends a local attachment without inventing an upload API',async()=>{
 mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/conversations')?{conversations:[{id:person,profileId:person,nickname:'Member',avatarUrl:null,status:'accepted',canSend:true,latestMessage:null}]}:undefined,loading:false,error:false}));
 mock.request.mockResolvedValue({messages:[]});
 render(<GroupSocialScreen locale='ko' conversationId={person} localMediaPreview={{messages:[{id:'photo',kind:'image',src:'/photo.webp',label:'사진 · 오후 3:24'},{id:'video',kind:'video',label:'동영상 · 오후 3:25',isMine:true}],attachment:{id:'pending',kind:'image',src:'/next.webp',label:'사진 1개'}}}/>);
 await screen.findByRole('img',{name:'사진'});
 expect(screen.getByText('사진 1개')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Local caption'}});
 fireEvent.click(screen.getByRole('button',{name:'보내기'}));
 expect(screen.getByText('Local caption')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'첨부 삭제'})).toBeNull();
 expect(mock.request.mock.calls.every(([,options])=>!options?.method)).toBe(true);
});
it('discards settings drafts when canceled',async()=>{
 mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/settings')?{profileVisible:true,favoriteSlugs:[],dmPolicy:'requests'}:undefined,loading:false,error:false}));
 render(<GroupSocialScreen locale='ko'/>);
 expect(screen.queryByRole('checkbox',{name:'공개 프로필'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'설정'}));
 fireEvent.click(screen.getByRole('checkbox',{name:'공개 프로필'}));
 fireEvent.click(screen.getByRole('button',{name:'취소'}));
 fireEvent.click(screen.getByRole('button',{name:'설정'}));
 expect(screen.getByRole('checkbox',{name:'공개 프로필'})).toBeChecked();
 expect(mock.request).not.toHaveBeenCalled();
});

it('opens a shared friend token as a confirmation and removes only that query on close',async()=>{
 const token='22222222-2222-4222-8222-222222222222';history.replaceState(null,'','/my/friends?locale=ko&friend='+token+'&filter=keep');
 mock.resource.mockImplementation((url:string)=>({data:url?.includes('/profile-links/')?{profile:{id:person,nickname:'QR friend',avatarUrl:'/images/avatars/star-pink.webp'},relationship:{friendshipId:null,status:'none'},capabilities:{canRequestFriend:true},isSelf:false}:url?.includes('/friends?')?{friendships:[]}:undefined,loading:false,error:false}));
 render(<GroupSocialScreen locale='ko'/>);expect(await screen.findByRole('dialog',{name:'상대 프로필'})).toBeInTheDocument();expect(screen.getByText('QR friend')).toBeInTheDocument();expect(mock.request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'닫기'}));expect(new URLSearchParams(location.search).has('friend')).toBe(false);expect(new URLSearchParams(location.search).get('filter')).toBe('keep');history.replaceState(null,'','/');
});

it('uploads DM media through the existing flow and sends its ready asset with a stable request identity',async()=>{
 const asset='22222222-2222-4222-8222-222222222222';mock.uploads.items=[{key:'upload',file:new File(['photo'],'photo.jpg',{type:'image/jpeg'}),media:{assetId:asset,state:'ready'}}];mock.uploads.ready=true;
 mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/conversations')?{conversations:[{id:person,profileId:person,nickname:'Friend',avatarUrl:null,status:'accepted',canSend:true,latestMessage:null}]}:undefined,loading:false,error:false}));mock.request.mockImplementation((url:string)=>Promise.resolve(url.includes('/messages?')?{messages:[]}:{}));
 render(<GroupSocialScreen locale='ko' conversationId={person}/>);await screen.findByText('photo.jpg');fireEvent.click(screen.getByRole('button',{name:'보내기'}));await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(`/api/me/social/conversations/${person}/messages`,expect.objectContaining({method:'POST'})));const call=mock.request.mock.calls.find(([,options])=>options?.method==='POST');expect(JSON.parse(call![1].body)).toMatchObject({text:'',assetId:asset,requestId:expect.any(String)});expect(mock.uploads.markUsed).toHaveBeenCalledWith('upload');
});
it('searches real conversation names and previews without making a new API',()=>{mock.resource.mockImplementation((url:string)=>({data:url?.endsWith('/conversations')?{conversations:[{id:person,profileId:person,nickname:'하늘',avatarUrl:null,status:'accepted',canSend:true,latestMessage:'오늘 무대'}, {id:'other',profileId:'other',nickname:'보라',avatarUrl:null,status:'incoming_request',canSend:false,latestMessage:null}]}:undefined,loading:false,error:false}));render(<GroupSocialScreen locale='ko'/>);fireEvent.change(screen.getByRole('searchbox',{name:'친구·대화 검색'}),{target:{value:'무대'}});expect(screen.getByText('하늘')).toBeInTheDocument();expect(screen.queryByText('보라')).toBeNull();expect(mock.request).not.toHaveBeenCalled();});
