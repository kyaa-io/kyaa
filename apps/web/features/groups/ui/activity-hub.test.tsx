import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupActivitiesPanel} from './group-activities';
import {activityHubCopy} from './activity-hub-copy';
import {APP_LOCALES} from '@/i18n/locales';
const state=vi.hoisted(()=>({query:'tab=activities&locale=ko',read:vi.fn(),certificationHref:'/creator?tab=certifications'}));
vi.mock('next/navigation',()=>({usePathname:()=>'/pages/groups/group-id',useSearchParams:()=>new URLSearchParams(state.query)}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string)=>{state.read(url);return {data:url.endsWith('/activities')?{certificationHref:state.certificationHref}:url.includes('/events')?{events:[],nextCursor:null}:{missions:[],nextCursor:null},ownerKey:'viewer',retry:()=>{},loading:false};}}));
afterEach(cleanup);beforeEach(()=>{state.query='tab=activities&locale=ko';state.read.mockClear();});
it('links hub destinations without fetching every activity list',()=>{
 render(<GroupActivitiesPanel pageId='group-id' locale='ko'/>);
 expect(screen.getByRole('link',{name:/팬 인증/})).toHaveAttribute('href','/creator?tab=certifications&locale=ko');
 expect(screen.getByRole('link',{name:/^이벤트/})).toHaveAttribute('href','/pages/groups/group-id?tab=activities&locale=ko&activity=events#group-activity-content');
 expect(state.read.mock.calls.map(call=>call[0])).toEqual(['/api/groups/group-id/activities']);
});
it('opens the chosen list and preserves its originating tab and locale on return',()=>{
 state.query='tab=activities&locale=ko&activity=events';render(<GroupActivitiesPanel pageId='group-id' locale='ko'/>);
 expect(screen.getByRole('link',{name:'활동'})).toHaveAttribute('href','/pages/groups/group-id?tab=activities&locale=ko#group-activity-content');
 expect(state.read).toHaveBeenCalledWith('/api/groups/group-id/events');expect(state.read.mock.calls.some(call=>call[0].endsWith('/missions'))).toBe(false);
});
it('has descriptions in every supported language',()=>{for(const locale of APP_LOCALES)expect(activityHubCopy(locale)).toHaveLength(4);});
