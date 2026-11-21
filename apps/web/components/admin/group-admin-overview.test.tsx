import {render,screen,within,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
vi.mock('./participation-controls',()=>({ParticipationAdmin:({children}:{children:(role:string)=>ReactNode})=><>{children('viewer')}</>}));
vi.mock('./group-leader-passes',()=>({GroupLeaderPasses:()=>null}));
import {GroupAdminOverview} from './group-admin-overview';
afterEach(cleanup);
it('connects the five review cards without duplicating the main navigation to existing routes',()=>{
 render(<GroupAdminOverview locale="ko"/>);
 expect(screen.queryByRole('navigation')).toBeNull();
 const list=screen.getByRole('list');expect(within(list).getAllByRole('link')).toHaveLength(5);
 expect(within(list).getByRole('link',{name:/선물 등록 신청/})).toHaveAttribute('href','/admin/groups/gift-applications');
 expect(within(list).getByRole('link',{name:/모임 개설 신청/})).toHaveAttribute('href','/admin/groups');
 expect(within(list).getByRole('link',{name:/공식 행사 신청/})).toHaveAttribute('href','/admin/groups/official-events');
 expect(within(list).getByRole('link',{name:/행사 승인/})).toHaveAttribute('href','/admin/groups/event-approvals');
 expect(within(list).getByRole('link',{name:/모임 신고/})).toHaveAttribute('href','/admin/groups/reports');
});
it('preserves the selected administrator language when navigating',()=>{
 render(<GroupAdminOverview locale="en"/>);
 for(const link of screen.getAllByRole('link'))expect(link.getAttribute('href')).toMatch(/\?lang=en$/);
});
