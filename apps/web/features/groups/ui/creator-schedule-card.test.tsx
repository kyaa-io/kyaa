import {act,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CreatorScheduleCard} from './creator-schedule-card';
import {pencilArtistCreator} from '../../../e2e/groups-local/pencil-artist-fixture';
const renderCalendar=vi.hoisted(()=>vi.fn());
vi.mock('@/features/fanpage/ui/celebrity-calendar',()=>({CelebrityMiniCalendar:(props:unknown)=>{renderCalendar(props);return <div>shared calendar</div>;}}));
it('shows the shared compact calendar immediately and keeps the creator full-calendar link',()=>{
 const celebrity=pencilArtistCreator('ko');render(<CreatorScheduleCard celebrity={celebrity} locale='ko' schedule={{label:'fixture',note:'fixture'}}/>);
 expect(renderCalendar).toHaveBeenCalledWith(expect.objectContaining({celebrity,locale:'ko',upcomingLive:null,embedded:true}));
 act(()=>renderCalendar.mock.calls[0][0].onMonthChange('2026-12'));expect(screen.getByRole('link',{name:'캘린더 크게 보기'})).toHaveAttribute('href','/nchive?tab=calendar&locale=ko&month=2026-12');expect(screen.getByText('shared calendar')).toBeVisible();expect(screen.queryByText('fixture')).toBeNull();
});
