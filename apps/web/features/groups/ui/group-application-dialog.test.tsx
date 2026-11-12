import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
import {GroupApplicationDialog} from './group-application-dialog';
const state=vi.hoisted(()=>({request:vi.fn(),authenticated:true,ownerKey:'actor:1'}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({...state,ready:true}),useGroupResource:()=>({data:undefined,error:false})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('./group-application-status-screen',()=>({}));
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
it('sends a no answer by default and asks for a link and capture after checking the question',async()=>{
 open();const form=fill();expect(screen.queryByText('운영자 자격 확인')).toBeNull();expect(screen.queryByLabelText('운영하던 페이지 링크')).toBeNull();
 state.request.mockRejectedValueOnce(new Error('offline'));fireEvent.submit(form);await screen.findByRole('alert');
 expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({kind:'fan',name:'Test community',qualification:{hasExistingPage:false}});
 fireEvent.click(screen.getByRole('checkbox',{name:'기존에 운영하던 페이지가 있나요?'}));state.request.mockClear();
 fireEvent.submit(form);expect(state.request).not.toHaveBeenCalled();expect(await screen.findByText('https로 시작하는 링크를 넣어 주세요.')).toBeInTheDocument();expect(screen.getByText('캡처를 1장 이상 올려 주세요.')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('운영하던 페이지 링크'),{target:{value:'http://cafe.example.test'}});fireEvent.submit(form);expect(state.request).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('운영하던 페이지 링크'),{target:{value:'https://cafe.example.test/club'}});expect(screen.queryByText('https로 시작하는 링크를 넣어 주세요.')).toBeNull();
});
it('does not ask a fan application for a photo or join question, which approval would discard',async()=>{
 open();expect(screen.queryByLabelText('가입 질문')).toBeNull();expect(screen.queryByText('추가 설정 (선택)')).toBeNull();
 const form=fill();expect(form.querySelector('input[name=question]')).toBeNull();expect(form.querySelector('input[type=file]')).toBeNull();
 state.request.mockRejectedValueOnce(new Error('offline'));fireEvent.submit(form);await screen.findByRole('alert');
 const body=JSON.parse(state.request.mock.calls.at(-1)![1].body);expect(body.kind).toBe('fan');expect(body).not.toHaveProperty('question');expect(body).not.toHaveProperty('imageAssetId');
});
it('keeps the photo and join question for hobby and brand pages',()=>{
 open('hobby');expect(screen.getByText('추가 설정 (선택)')).toBeInTheDocument();const form=screen.getByLabelText('페이지 이름').closest('form')!;expect(form.querySelector('input[name=question]')).not.toBeNull();
});
it('leads a received application to its status',async()=>{
 open();const form=fill();state.request.mockResolvedValueOnce({id,status:'submitted',pageId:null});fireEvent.submit(form);
 expect(await screen.findByRole('heading',{name:'팬페이지 개설 신청을 보냈어요'})).toBeInTheDocument();
 expect(screen.getByText('운영팀이 승인하면 페이지가 열려요.')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'내 신청 보기'})).toHaveAttribute('href','/pages/groups/apply?view=mine&locale=ko');
});
it('shows no description line under the page type choice',()=>{
 open('hobby');expect(screen.queryByText(/^취미: /)).toBeNull();
 fireEvent.click(screen.getByRole('radio',{name:'브랜드'}));expect(screen.queryByText(/^브랜드: /)).toBeNull();
});
it('carries a searched name into the fan name field',()=>{
 render(<GroupApplicationDialog locale='ko' initialKind='fan' initialName='Ru' onClose={vi.fn()}/>);expect(screen.getByRole('combobox',{name:'페이지 이름'})).toHaveValue('Ru');
});
it('guards browser Back without dropping dirty fields or underlying listing state',()=>{
 open();fill();expect(history.state.preserved).toBe('ledger');history.replaceState({preserved:'ledger'},'','/pages/groups?locale=ko');fireEvent.popState(window,{state:history.state});
 expect(screen.getByRole('dialog',{name:'작성을 그만둘까요?'})).toBeVisible();expect(location.pathname).toBe('/pages/groups');fireEvent.click(screen.getAllByRole('button',{name:'계속 작성'}).at(-1)!);expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
});
it('uses login fallback with exact fan context instead of sending a guest application',()=>{
 state.authenticated=false;open();expect(screen.getByRole('link',{name:'로그인'}).getAttribute('href')).toContain('kind%3Dfan');expect(screen.queryByRole('textbox')).not.toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});
it('keeps optional settings collapsed and keeps the chosen brand type',()=>{
 open('hobby');expect(screen.queryByLabelText('가입 질문 (선택)')).not.toBeVisible();
 fireEvent.click(screen.getByRole('radio',{name:'브랜드'}));fill();
 fireEvent.click(screen.getByText('추가 설정 (선택)'));expect(screen.getByLabelText('가입 질문 (선택)')).toBeVisible();
 expect(screen.getByRole('radio',{name:'브랜드'})).toBeChecked();expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');
});
it('preserves the draft across hobby and brand switching and submits hobby with only the no answer',async()=>{
 open('hobby');fill();fireEvent.click(screen.getByRole('radio',{name:'브랜드'}));fireEvent.click(screen.getByRole('radio',{name:'취미'}));
 expect(screen.getByLabelText('페이지 이름')).toHaveValue('Test community');expect(screen.getByLabelText('페이지 소개')).toHaveValue('Original community description');
 state.request.mockResolvedValueOnce({id,status:'submitted',pageId:null});fireEvent.submit(screen.getByLabelText('페이지 이름').closest('form')!);
 await screen.findByRole('dialog',{name:'신청 접수'});expect(state.request).toHaveBeenCalledOnce();expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({kind:'hobby',name:'Test community',description:'Original community description'});expect(JSON.parse(state.request.mock.calls[0][1].body).qualification).toEqual({hasExistingPage:false});
});

it('disables modal submission after a failed capture upload and re-enables after retry',async()=>{
 open();fill();fireEvent.click(screen.getByRole('checkbox',{name:'기존에 운영하던 페이지가 있나요?'}));
 const submit=screen.getByRole('button',{name:'팬페이지 개설 신청'});expect(submit).toBeEnabled();
 fireEvent.change(screen.getByLabelText('캡처 올리기'),{target:{files:[new File(['image'],'proof.png',{type:'image/png'})]}});
 await waitFor(()=>expect(submit).toBeDisabled());expect(state.request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));await waitFor(()=>expect(submit).toBeEnabled());expect(state.request).not.toHaveBeenCalled();
});
