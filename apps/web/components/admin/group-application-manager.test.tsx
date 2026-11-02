import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({run:vi.fn(),role:'admin',items:['submitted','reviewing','changes_requested','approved','rejected'].map((status,i)=>({id:`e9700000-0000-4000-8000-00000000000${i+1}`,name:`Application ${status}`,kind:'hobby',description:'Submitted description',question:null,status,reason:null,created_at:'2026-11-01T00:00:00Z'}))}));
vi.mock('./participation-controls',()=>({
 ParticipationAdmin:({children}:{children:(role:string)=>unknown})=>children(fixture.role),
 useAdminPage:()=>({state:{status:'ready',data:fixture.items,nextCursor:null},retry:vi.fn()}),
 useParticipationCreators:()=>({state:{status:'ready',data:[]}}),
 CreatorSelect:()=> <select name="celebrityId" aria-label="Fan page"><option value="">Choose</option><option value="e9700000-0000-4000-8000-000000000009">Artist</option></select>,AdminListState:()=>null,styles:{},
}));
vi.mock('@/features/schedules/ui/participation-ui',()=>({ActionFeedback:()=>null,useParticipationAction:()=>({busy:false,error:null,run:fixture.run,idempotencyKey:()=> 'fixture'})}));
import {GroupApplicationManager} from './group-application-manager';
afterEach(()=>{cleanup();fixture.role='admin';fixture.run.mockClear();fixture.items[0].kind='hobby';});
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
