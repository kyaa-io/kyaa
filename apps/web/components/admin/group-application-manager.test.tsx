import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({run:vi.fn(),reload:vi.fn(),creators:[] as unknown[],role:'admin',items:['submitted','reviewing','changes_requested','approved','rejected'].map((status,i)=>({id:`e9700000-0000-4000-8000-00000000000${i+1}`,name:`Application ${status}`,kind:'hobby',description:'Submitted description',question:null,status,reason:null,created_at:'2026-11-01T00:00:00Z'}))}));
vi.mock('./participation-controls',()=>({
 ParticipationAdmin:({children}:{children:(role:string)=>unknown})=>children(fixture.role),
 useAdminPage:()=>({state:{status:'ready',data:fixture.items,nextCursor:null},retry:vi.fn()}),
 useParticipationCreators:()=>({state:{status:'ready',data:fixture.creators},retry:fixture.reload}),
 CreatorSelect:({value}:{value?:string})=> <select name="celebrityId" aria-label="Fan page" defaultValue={value??''}><option value="">Choose</option><option value="e9700000-0000-4000-8000-000000000009">Artist</option></select>,AdminListState:()=>null,styles:{},
}));
vi.mock('@/features/groups/ui/group-image',()=>({GroupImage:({src}:{src:string})=><img src={src} alt=''/>}));
vi.mock('@/features/schedules/ui/participation-ui',()=>({ActionFeedback:()=>null,useParticipationAction:()=>({busy:false,error:null,run:fixture.run,idempotencyKey:()=> 'fixture'})}));
import {GroupApplicationManager} from './group-application-manager';
afterEach(()=>{cleanup();fixture.role='admin';fixture.run.mockClear();fixture.items[0].kind='hobby';fixture.creators=[];delete (fixture.items[0] as Record<string,unknown>).qualification;});
describe('group application review',()=>{
 it('keeps all unresolved statuses in pending and separates completed applications',()=>{
  render(<GroupApplicationManager locale="en"/>);
  expect(screen.getByRole('button',{name:/Application submitted/})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Application reviewing/})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Application changes_requested/})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Application approved/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Completed'}));
  expect(screen.getByRole('button',{name:/Application approved/})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Application rejected/})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Approve'})).not.toBeInTheDocument();
 });
 it('shows the operating experience answer with its link and screenshots',()=>{
  const asset='e9700000-0000-4000-8000-00000000000a';
  (fixture.items[0] as Record<string,unknown>).qualification={hasExistingPage:true,evidenceUrl:'https://cafe.example.test/club',assetIds:[asset]};
  const {container}=render(<GroupApplicationManager locale="ko"/>);
  expect(screen.getByText('기존에 운영하던 페이지').nextElementSibling).toHaveTextContent('있음');
  expect(screen.getByRole('link',{name:'https://cafe.example.test/club'})).toHaveAttribute('rel','noopener noreferrer');
  expect(container.querySelector(`[src*="${asset}"]`)).not.toBeNull();
  expect(screen.queryByText('커뮤니티 이름')).not.toBeInTheDocument();
 });
 it('shows no link or screenshot rows when there is no earlier page',()=>{
  (fixture.items[0] as Record<string,unknown>).qualification={hasExistingPage:false};
  render(<GroupApplicationManager locale="ko"/>);
  expect(screen.getByText('기존에 운영하던 페이지').nextElementSibling).toHaveTextContent('없음');
  expect(screen.queryByText('운영 페이지 링크')).not.toBeInTheDocument();
 });
 it('keeps showing an application saved in the earlier form',()=>{
  (fixture.items[0] as Record<string,unknown>).qualification={communityName:'Old club',evidenceUrl:'https://cafe.example.test/old',introduction:'Earlier answer',assetIds:[]};
  render(<GroupApplicationManager locale="en"/>);
  expect(screen.getByText('Old club')).toBeInTheDocument();
  expect(screen.getByText('Earlier answer')).toBeInTheDocument();
 });
 it('says what to do when a fan application names no published creator',()=>{
  fixture.items[0].kind='fan';fixture.items[0].name='아이유';render(<GroupApplicationManager locale='ko'/>);
  expect(screen.getByRole('status')).toHaveTextContent("'아이유' 크리에이터가 없습니다");
  expect(screen.getByRole('link',{name:'크리에이터 관리'})).toHaveAttribute('href','/admin/celebrities?lang=ko');
  fireEvent.click(screen.getByRole('button',{name:'목록 다시 읽기'}));expect(fixture.reload).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'승인하기'}));expect(fixture.run).not.toHaveBeenCalled();
 });
 it('names an unpublished creator and points at that creator',()=>{
  fixture.items[0].kind='fan';fixture.items[0].name='아이유';fixture.creators=[{id:'e9700000-0000-4000-8000-000000000009',slug:'iu',nameKo:'아이유',nameEn:'IU',status:'draft'}];render(<GroupApplicationManager locale='ko'/>);
  expect(screen.getByRole('status')).toHaveTextContent('아직 공개되지 않았습니다');
  expect(screen.getByRole('link',{name:'크리에이터 관리'})).toHaveAttribute('href','/admin/celebrities/e9700000-0000-4000-8000-000000000009?lang=ko');
 });
 it('selects the published creator of the same name for the reviewer',()=>{
  fixture.items[0].kind='fan';fixture.items[0].name='아이 유';fixture.creators=[{id:'e9700000-0000-4000-8000-000000000009',slug:'iu',nameKo:'아이유',nameEn:'IU',status:'published'}];render(<GroupApplicationManager locale='ko'/>);
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'승인하기'}));expect(fixture.run).toHaveBeenCalledOnce();expect(fixture.run.mock.calls[0][2]).toMatchObject({celebrityId:'e9700000-0000-4000-8000-000000000009'});
 });
 it('preserves read-only review for a viewer',()=>{
  fixture.role='viewer';render(<GroupApplicationManager locale="en"/>);
  expect(screen.getByRole('button',{name:'Approve'})).toBeDisabled();
  expect(screen.getByRole('textbox',{name:'Review notes'})).toBeDisabled();
 });
 it('requires a reason for rejection but allows rejection without linking a fan page',()=>{
  fixture.items[0].kind='fan';render(<GroupApplicationManager locale="en"/>);
  fireEvent.click(screen.getByRole('button',{name:'Reject'}));
  expect(fixture.run).not.toHaveBeenCalled();
  fireEvent.input(screen.getByRole('textbox',{name:'Review notes'}),{target:{value:'Insufficient evidence'}});
  fireEvent.click(screen.getByRole('button',{name:'Reject'}));
  expect(fixture.run).toHaveBeenCalledWith(expect.any(String),'PATCH',expect.objectContaining({action:'reject',reason:'Insufficient evidence'}),expect.any(Function));
 });
 it('requires a creator for fan approval and preserves the approved payload',()=>{
  fixture.items[0].kind='fan';render(<GroupApplicationManager locale="en"/>);
  fireEvent.click(screen.getByRole('button',{name:'Approve'}));
  expect(fixture.run).not.toHaveBeenCalled();
  fireEvent.input(screen.getByRole('combobox',{name:'Fan page'}),{target:{value:'e9700000-0000-4000-8000-000000000009'}});
  fireEvent.click(screen.getByRole('button',{name:'Approve'}));
  expect(fixture.run).toHaveBeenCalledWith(expect.any(String),'PATCH',expect.objectContaining({action:'approve',celebrityId:'e9700000-0000-4000-8000-000000000009'}),expect.any(Function));
 });

 it('does not carry a rejected action validation error into another decision',()=>{
  render(<GroupApplicationManager locale="en"/>);
  fireEvent.click(screen.getByRole('button',{name:'Reject'}));
  expect(fixture.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Approve'}));
  expect(fixture.run).toHaveBeenCalledWith(expect.any(String),'PATCH',expect.objectContaining({action:'approve',reason:''}),expect.any(Function));
 });

});
