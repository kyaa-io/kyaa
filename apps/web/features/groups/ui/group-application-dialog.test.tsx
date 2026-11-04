import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
import {GroupApplicationDialog} from './group-application-dialog';
const state=vi.hoisted(()=>({request:vi.fn(),authenticated:true,ownerKey:'actor:1'}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({...state,ready:true}),useGroupResource:()=>({data:undefined,error:false})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('./group-application-history',()=>({GroupApplicationHistory:()=>null}));
vi.mock('./group-application-aside',()=>({GroupApplicationAside:()=>null}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>undefined}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>{const [file,setFile]=useState<File|null>(null),[failed,setFailed]=useState(false);return {items:file?[{key:'proof',file,failed}]:[],busy:false,ready:!!file&&!failed,invalid:false,add:(files:File[])=>{setFile(files[0]);setFailed(true);},remove:()=>setFile(null),retry:()=>setFailed(false),markUsed:vi.fn()};}}));
const id='e9200000-0000-4000-8000-000000000001';
const originalShow=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal'),originalClose=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'close');
beforeAll(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.open=false;}});});
afterAll(()=>{for(const [key,descriptor] of [['showModal',originalShow],['close',originalClose]] as const){if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,key,descriptor);else Reflect.deleteProperty(HTMLDialogElement.prototype,key);}});
beforeEach(()=>{state.request.mockReset();state.authenticated=true;state.ownerKey='actor:1';history.replaceState({preserved:'ledger'},'','/pages/groups?locale=ko');});
function Harness({kind='fan'}:{kind?:'fan'|'hobby'}){const[open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open</button>{open&&<GroupApplicationDialog locale="ko" initialKind={kind} onClose={()=>setOpen(false)}/>}</>;}
function open(kind:'fan'|'hobby'='fan'){render(<Harness kind={kind}/>);const trigger=screen.getByText('Open');trigger.focus();fireEvent.click(trigger);return trigger;}
function fill(){fireEvent.change(screen.getByLabelText('페이지 이름'),{target:{value:'Test community'}});fireEvent.change(screen.getByLabelText('페이지 소개'),{target:{value:'Original community description'}});return screen.getByLabelText('페이지 이름').closest('form')!;}
it('keeps fan-only type, required fields, dirty confirmation and focus restoration',()=>{
 const trigger=open();expect(screen.queryByRole('radio')).toBeNull();expect(screen.getByLabelText('페이지 이름').closest('form')!.querySelector('input[name=kind]')).toHaveValue('fan');
 const name=screen.getByLabelText('페이지 이름');expect(name).toBeRequired();expect(name.closest('form')!.checkValidity()).toBe(false);
 fill();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.getByRole('dialog',{name:'작성을 그만둘까요?'})).toBeVisible();
 fireEvent.click(screen.getAllByRole('button',{name:'계속 작성'}).at(-1)!);expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});fireEvent.click(screen.getByRole('button',{name:'내용 버리기'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus();expect(state.request).not.toHaveBeenCalled();
});
it('preserves errors and retry id, allows brand selection, and submits once while pending',async()=>{
 open('hobby');expect(screen.queryByRole('radio',{name:'팬'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('radio',{name:'브랜드'}));const form=fill();
 state.request.mockRejectedValueOnce(new Error('offline'));fireEvent.submit(form);await screen.findByRole('alert');expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
 let finish!:(value:unknown)=>void;state.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.submit(form);fireEvent.submit(form);
 expect(state.request).toHaveBeenCalledTimes(2);expect(JSON.parse(state.request.mock.calls[1][1].body)).toEqual(JSON.parse(state.request.mock.calls[0][1].body));expect(JSON.parse(state.request.mock.calls[1][1].body).kind).toBe('brand');
 await act(async()=>finish({id,status:'submitted',pageId:null}));expect(screen.getByRole('dialog',{name:'신청 접수'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'페이지 둘러보기'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('retains basic and qualification drafts across stages and keeps the fan policy context',async()=>{
 open();fill();fireEvent.click(screen.getByText('추가 설정 (선택)'));fireEvent.click(screen.getByRole('link',{name:'운영자 자격 확인'}));
 expect(screen.queryByRole('combobox')).toBeNull();expect(screen.getByRole('button',{name:'페이지 개설 신청'}).closest('footer')).not.toBeNull();expect(screen.getByLabelText('기존 모임 이름').closest('form')!.querySelector('input[name=kind]')).toHaveValue('fan');
 fireEvent.change(screen.getByLabelText('기존 모임 이름'),{target:{value:'Existing fan community'}});
 fireEvent.click(screen.getByRole('button',{name:'이전'}));expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
 fireEvent.click(screen.getByRole('link',{name:'운영자 자격 확인'}));expect(screen.getByLabelText('기존 모임 이름')).toHaveValue('Existing fan community');
 fireEvent.change(screen.getByLabelText('운영 증빙 주소'),{target:{value:'https://example.test/community'}});fireEvent.change(screen.getByLabelText('운영 소개'),{target:{value:'Verified existing community description'}});
 state.request.mockResolvedValueOnce({id,status:'submitted',pageId:null});fireEvent.submit(screen.getByLabelText('기존 모임 이름').closest('form')!);await waitFor(()=>expect(screen.getByRole('dialog',{name:'신청 접수'})).toBeVisible());
 expect(state.request).toHaveBeenCalledOnce();expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({kind:'fan',name:'Test community',description:'Original community description',qualification:{communityName:'Existing fan community',evidenceUrl:'https://example.test/community'}});
});
it('guards browser Back without dropping dirty fields or underlying listing state',()=>{
 open();fill();expect(history.state.preserved).toBe('ledger');history.replaceState({preserved:'ledger'},'','/pages/groups?locale=ko');fireEvent.popState(window,{state:history.state});
 expect(screen.getByRole('dialog',{name:'작성을 그만둘까요?'})).toBeVisible();expect(location.pathname).toBe('/pages/groups');fireEvent.click(screen.getAllByRole('button',{name:'계속 작성'}).at(-1)!);expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
});
it('uses login fallback with exact fan context instead of sending a guest application',()=>{
 state.authenticated=false;open();expect(screen.getByRole('link',{name:'로그인'}).getAttribute('href')).toContain('kind%3Dfan');expect(screen.queryByRole('textbox')).not.toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});
it('keeps optional settings collapsed and uses the chosen brand type for qualification',()=>{
 open('hobby');expect(screen.queryByLabelText('가입 질문 (선택)')).not.toBeVisible();
 fireEvent.click(screen.getByRole('radio',{name:'브랜드'}));fill();
 fireEvent.click(screen.getByText('추가 설정 (선택)'));expect(screen.getByLabelText('가입 질문 (선택)')).toBeVisible();
 fireEvent.click(screen.getByRole('link',{name:'운영자 자격 확인'}));
 expect(screen.getByLabelText('기존 모임 이름').closest('form')!.querySelector('input[name=kind]')).toHaveValue('brand');
 fireEvent.click(screen.getByRole('button',{name:'이전'}));expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
});
it('preserves the draft across hobby and brand switching and submits hobby without invented proof',async()=>{
 open('hobby');fill();fireEvent.click(screen.getByRole('radio',{name:'브랜드'}));fireEvent.click(screen.getByRole('radio',{name:'취미'}));
 expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');expect(screen.getByLabelText('페이지 소개')).toHaveValue('Original community description');
 state.request.mockResolvedValueOnce({id,status:'submitted',pageId:null});fireEvent.submit(screen.getByLabelText('페이지 이름').closest('form')!);
 await screen.findByRole('dialog',{name:'신청 접수'});expect(state.request).toHaveBeenCalledOnce();expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({kind:'hobby',name:'Test community',description:'Original community description'});expect(JSON.parse(state.request.mock.calls[0][1].body)).not.toHaveProperty('qualification');
});

it('disables modal submission after a failed evidence upload and re-enables after retry',async()=>{
 open();fill();fireEvent.click(screen.getByText('추가 설정 (선택)'));fireEvent.click(screen.getByRole('link',{name:'운영자 자격 확인'}));
 const submit=screen.getByRole('button',{name:'페이지 개설 신청'});expect(submit).toBeEnabled();
 fireEvent.change(screen.getByLabelText('자료 첨부'),{target:{files:[new File(['image'],'proof.png',{type:'image/png'})]}});
 await waitFor(()=>expect(submit).toBeDisabled());expect(state.request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));await waitFor(()=>expect(submit).toBeEnabled());expect(state.request).not.toHaveBeenCalled();
});
