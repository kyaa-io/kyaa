import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupManagementMembers} from './group-management-members';
import {groupsCopy} from './copy';
import type {GroupDetail} from '../domain/contracts';
const state=vi.hoisted(()=>({error:false,items:[] as unknown[],nextCursor:null as string|null,urls:[] as string[],retry:vi.fn(),failOn:''}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string)=>{state.urls.push(url);const fail=state.error||(state.failOn!==''&&url.includes(state.failOn));return {ownerKey:'owner',request:vi.fn(),retry:state.retry,loading:false,error:fail,data:fail?null:{items:state.items,nextCursor:url.includes('cursor=')?null:state.nextCursor}};}}));
vi.mock('./group-member-invitation',()=>({GroupMemberInvitationDialog:()=>null}));
const id='10000000-0000-4000-8000-000000000001';
const detail={page:{id,kind:'hobby',celebrityId:null,slug:null,name:'모임',description:'소개',imageUrl:null,question:null,anonymous:false,memberCount:0},membership:{role:'owner',joinedAt:'2026-11-01'}} as unknown as GroupDetail;
beforeEach(()=>{state.error=false;state.items=[];state.nextCursor=null;state.urls=[];state.failOn='';state.retry.mockClear();});
it('does not show the page-list empty text in the member aside on an API error',()=>{
 state.error=true;
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 const aside=container.querySelector('aside')!;
 expect(screen.getByRole('alert')).toHaveTextContent(groupsCopy('ko').error);
 expect(aside).not.toHaveTextContent(groupsCopy('ko').empty);
});
it('keeps the page-list empty text out of the list and the aside when there are no members',()=>{
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 expect(container.querySelector('aside')).not.toHaveTextContent(groupsCopy('ko').empty);
 expect(container.querySelector('aside h2')).toBeNull();
 expect(container).not.toHaveTextContent(groupsCopy('ko').empty);
});
it('shows the no-match state when the staff filter leaves no rows, in each locale',async()=>{
 const {managementMembersCopy}=await import('./management-members-copy');
 const {fireEvent}=await import('@testing-library/react');
 state.items=[{profileId:'20000000-0000-4000-8000-000000000001',nickname:'회원',avatarUrl:null,role:'member',answer:null,tier:null,joinedAt:'2026-11-01T00:00:00Z',lastActiveAt:null,postCount:0,commentCount:0}];
 for(const locale of ['ko','en','ja'] as const){
  const {container,unmount}=render(<GroupManagementMembers detail={detail} locale={locale} refresh={()=>{}}/>);
  expect(container).not.toHaveTextContent(managementMembersCopy(locale).noMatch);
  fireEvent.click(container.querySelectorAll('button[aria-pressed]')[1]);
  expect(screen.getByRole('status')).toHaveTextContent(managementMembersCopy(locale).noMatch);
  unmount();
 }
 expect(managementMembersCopy('ko').noMatch).toBe('일치하는 회원이 없어요.');
});
it('keeps the rows already read when a continued read fails and retries with the same cursor',()=>{
 state.items=[{profileId:'20000000-0000-4000-8000-000000000001',nickname:'먼저읽은회원',avatarUrl:null,role:'member',answer:null,tier:null,joinedAt:'2026-11-01T00:00:00Z',lastActiveAt:null,postCount:0,commentCount:0}];
 state.nextCursor='c1';state.failOn='cursor=c1';
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 expect(screen.queryByRole('alert')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:groupsCopy('ko').more}));
 expect(container.querySelector('table')).toHaveTextContent('먼저읽은회원');
 expect(screen.getByRole('alert')).toHaveTextContent(groupsCopy('ko').error);
 expect(state.urls.at(-1)).toContain('cursor=c1');
 fireEvent.click(screen.getByRole('button',{name:groupsCopy('ko').retry}));
 expect(state.retry).toHaveBeenCalledTimes(1);
 expect(state.urls.at(-1)).toContain('cursor=c1');
});
it('keeps the first-page failure as the error alone without a table',()=>{
 state.error=true;
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 expect(container.querySelector('table')).toBeNull();
 expect(screen.getByRole('alert')).toHaveTextContent(groupsCopy('ko').error);
});
it('appends the next page once after a failed continued read succeeds on retry, without repeating rows',()=>{
 const row=(n:string,i:number)=>({profileId:`20000000-0000-4000-8000-00000000000${i}`,nickname:n,avatarUrl:null,role:'member',answer:null,tier:null,joinedAt:'2026-11-01T00:00:00Z',lastActiveAt:null,postCount:0,commentCount:0});
 state.items=[row('첫째회원',1)];state.nextCursor='c1';state.failOn='cursor=c1';
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:groupsCopy('ko').more}));
 expect(screen.getByRole('alert')).toBeInTheDocument();
 state.failOn='';state.items=[row('둘째회원',2)];state.nextCursor=null;
 fireEvent.click(container.querySelectorAll('button[aria-pressed]')[1]);
 fireEvent.click(container.querySelectorAll('button[aria-pressed]')[0]);
 const text=container.querySelector('table')!.textContent!;
 expect(text.split('첫째회원').length-1).toBe(1);
 expect(text.split('둘째회원').length-1).toBe(1);
});
