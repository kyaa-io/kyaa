import {fireEvent,render,screen,within} from '@testing-library/react';
const chip=(name:string|RegExp)=>within(screen.getByRole('navigation')).getByRole('button',{name});
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupManagementMembers} from './group-management-members';
import {groupsCopy} from './copy';
import type {GroupDetail} from '../domain/contracts';
const state=vi.hoisted(()=>({error:false,items:[] as unknown[],nextCursor:null as string|null,urls:[] as string[],retry:vi.fn(),failOn:'',jjinfanTotal:null as number|null}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string)=>{state.urls.push(url);if(!url.includes('/operator-members?'))throw new Error(`unexpected read ${url}`);const fail=state.error||(state.failOn!==''&&url.includes(state.failOn));return {ownerKey:'owner',request:vi.fn(),retry:state.retry,loading:false,error:fail,data:fail?null:{total:state.items.length,jjinfanTotal:state.jjinfanTotal,items:state.items,nextCursor:url.includes('cursor=')?null:state.nextCursor}};}}));
vi.mock('./group-member-invitation',()=>({GroupMemberInvitationDialog:()=>null}));
const id='10000000-0000-4000-8000-000000000001';
const detail={page:{id,kind:'hobby',celebrityId:null,slug:null,name:'모임',description:'소개',imageUrl:null,question:null,anonymous:false,memberCount:0},membership:{role:'owner',joinedAt:'2026-11-01'}} as unknown as GroupDetail;
beforeEach(()=>{state.error=false;state.items=[];state.nextCursor=null;state.urls=[];state.failOn='';state.jjinfanTotal=null;state.retry.mockClear();});
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
 const {operatorToolsCopy}=await import('./operator-tools-copy');
 const {fireEvent}=await import('@testing-library/react');
 state.items=[{profileId:'20000000-0000-4000-8000-000000000001',nickname:'회원',avatarUrl:null,role:'member',joinedAt:'2026-11-01T00:00:00Z',jjinfan:null,hearts:null,missionCount:0,lastActiveAt:null}];
 for(const locale of ['ko','en','ja'] as const){
  const {container,unmount}=render(<GroupManagementMembers detail={detail} locale={locale} refresh={()=>{}}/>);
  expect(container).not.toHaveTextContent(operatorToolsCopy(locale).noMatch);
  fireEvent.click(chip(operatorToolsCopy(locale).staff));
  expect(screen.getByRole('status')).toHaveTextContent(operatorToolsCopy(locale).noMatch);
  unmount();
 }
 expect(operatorToolsCopy('ko').noMatch).toBe('일치하는 회원이 없습니다');
});
it('keeps the rows already read when a continued read fails and retries with the same cursor',()=>{
 state.items=[{profileId:'20000000-0000-4000-8000-000000000001',nickname:'먼저읽은회원',avatarUrl:null,role:'member',joinedAt:'2026-11-01T00:00:00Z',jjinfan:null,hearts:null,missionCount:0,lastActiveAt:null}];
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
 const row=(n:string,i:number)=>({profileId:`20000000-0000-4000-8000-00000000000${i}`,nickname:n,avatarUrl:null,role:'member',joinedAt:'2026-11-01T00:00:00Z',jjinfan:null,hearts:null,missionCount:0,lastActiveAt:null});
 state.items=[row('첫째회원',1)];state.nextCursor='c1';state.failOn='cursor=c1';
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:groupsCopy('ko').more}));
 expect(screen.getByRole('alert')).toBeInTheDocument();
 state.failOn='';state.items=[row('둘째회원',2)];state.nextCursor=null;
 fireEvent.click(chip('운영진'));
 fireEvent.click(chip(groupsCopy('ko').all));
 const text=container.querySelector('table')!.textContent!;
 expect(text.split('첫째회원').length-1).toBe(1);
 expect(text.split('둘째회원').length-1).toBe(1);
});
it('writes a plain empty value instead of a dash when a member has no activity, in each locale',async()=>{
 const {managementMembersCopy}=await import('./management-members-copy');
 const {APP_LOCALES}=await import('@/i18n/locales');
 state.items=[{profileId:'20000000-0000-4000-8000-000000000001',nickname:'회원',avatarUrl:null,role:'member',joinedAt:'2026-11-01T00:00:00Z',jjinfan:null,hearts:null,missionCount:0,lastActiveAt:null}];
 for(const locale of APP_LOCALES){
  const {container,unmount}=render(<GroupManagementMembers detail={detail} locale={locale} refresh={()=>{}}/>);
  expect(container.textContent).not.toContain('—');
  expect(container).toHaveTextContent(managementMembersCopy(locale).noRecord);
  unmount();
 }
});
const sensitive=['홍길동','010-1234-5678','01098765432','abc123','me@example.com','b8-pii@example.test','900101'];
it('P4: renders no join answer row and none of the seeded contact strings, with the public nickname kept',async()=>{
 const {operatorToolsCopy}=await import('./operator-tools-copy');
 // A server that still sent the old key must not reach the screen: the contract has no such field.
 state.items=[{profileId:'20000000-0000-4000-8000-000000000001',nickname:'연락010',avatarUrl:null,role:'member',joinedAt:'2026-11-01T00:00:00Z',jjinfan:null,hearts:null,missionCount:2,lastActiveAt:'2026-11-02T00:00:00Z'}];
 const {container}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 const text=container.textContent!;
 for(const value of sensitive)expect(text).not.toContain(value);
 expect(text).not.toContain(groupsCopy('ko').answer);
 expect(text).toContain('연락010');
 expect(container.querySelector('aside')).toHaveTextContent(operatorToolsCopy('ko').missions);
});
it('U3: a hobby page has no true-fan column or filter; a fan page has both and asks the server for true fans',async()=>{
 const {operatorToolsCopy}=await import('./operator-tools-copy');
 const o=operatorToolsCopy('ko');
 const row={profileId:'20000000-0000-4000-8000-000000000001',nickname:'하트팬',avatarUrl:null,role:'member',joinedAt:'2026-11-01T00:00:00Z',jjinfan:true,hearts:3,missionCount:1,lastActiveAt:null};
 state.items=[{...row,jjinfan:null,hearts:null}];
 const hobby=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 expect(screen.queryByRole('columnheader',{name:o.hearts})).toBeNull();
 expect(within(screen.getByRole('navigation')).queryByRole('button',{name:o.jjinfan})).toBeNull();
 hobby.unmount();
 state.items=[row];state.jjinfanTotal=1;
 const fanDetail={...detail,page:{...detail.page,kind:'fan',celebrityId:'30000000-0000-4000-8000-000000000001'}} as unknown as GroupDetail;
 render(<GroupManagementMembers detail={fanDetail} locale='ko' refresh={()=>{}}/>);
 expect(screen.getByRole('columnheader',{name:o.hearts})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'회원 1명'})).toBeInTheDocument();
 fireEvent.click(chip(/찐팬/));
 expect(state.urls.at(-1)).toContain('jjinfan=yes');
});
it('offers the CSV export to the owner only',()=>{
 const {unmount}=render(<GroupManagementMembers detail={detail} locale='ko' refresh={()=>{}}/>);
 expect(screen.getByRole('button',{name:'CSV 내보내기'})).toBeInTheDocument();
 unmount();
 render(<GroupManagementMembers detail={{...detail,membership:{role:'manager',joinedAt:'2026-11-01'}} as unknown as GroupDetail} locale='ko' refresh={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'CSV 내보내기'})).toBeNull();
});
