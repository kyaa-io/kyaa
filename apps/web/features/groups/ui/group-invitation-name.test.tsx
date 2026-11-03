import type {ReactNode} from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {GroupMembershipInvitationScreen} from './group-membership-invitation';
import {groupInvitationCopy} from './group-invitation-copy';
const fixture=vi.hoisted(()=>({pageName:"Studio $& $' $` {name} <b>raw</b>",pageHref:'/pages/groups/example',status:'pending',loginRequired:true}));
vi.mock('./use-group-resource',()=>({useGroupResource:()=>({data:fixture,loading:false,error:false})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock('./task-panel',()=>({TaskPanel:({children,actions}:{children:ReactNode;actions:ReactNode})=><section>{children}{actions}</section>,TaskActions:({children}:{children:ReactNode})=><>{children}</>}));
afterEach(cleanup);
it.each(APP_LOCALES)('%s invitation preserves literal stored names',locale=>{
 const {container}=render(<GroupMembershipInvitationScreen invitationId='example' locale={locale}/>);
 const [prefix,suffix]=groupInvitationCopy(locale).invited.split('{name}');
 expect(screen.getByText(prefix+fixture.pageName+suffix)).toBeVisible();
 expect(container.querySelector('b')).toBeNull();
});
