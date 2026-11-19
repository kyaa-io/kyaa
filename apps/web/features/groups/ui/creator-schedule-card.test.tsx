import {act,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CreatorScheduleCard} from './creator-schedule-card';
import {pencilArtistCreator} from '../../../e2e/groups-local/pencil-artist-fixture';
const {renderCalendar,useDukjil}=vi.hoisted(()=>({renderCalendar:vi.fn(),useDukjil:vi.fn()}));
vi.mock('@/features/dukjil/ui/dukjil-provider',()=>({useDukjil}));
vi.mock('@/features/fanpage/ui/celebrity-calendar',()=>({CelebrityMiniCalendar:(props:unknown)=>{renderCalendar(props);return <div>shared calendar</div>;}}));
it('shows the shared compact calendar immediately and keeps the creator full-calendar link',()=>{
 const celebrity=pencilArtistCreator('ko');render(<CreatorScheduleCard celebrity={celebrity} locale='ko' schedule={{label:'fixture',note:'fixture'}}/>);
 expect(renderCalendar).toHaveBeenCalledWith(expect.objectContaining({celebrity,locale:'ko',upcomingLive:null,embedded:true}));
 act(()=>renderCalendar.mock.calls[0][0].onMonthChange('2026-12'));expect(screen.getByRole('link',{name:'캘린더 크게 보기'})).toHaveAttribute('href','/nchive?tab=calendar&locale=ko&month=2026-12');expect(screen.getByText('shared calendar')).toBeVisible();expect(screen.queryByText('fixture')).toBeNull();
});

it('uses the creator receipt immediately and preserves the server KST date across midnight',()=>{
 const celebrity=pencilArtistCreator('ko');
 const beforeMidnight={kstDate:'2026-11-19',policyActive:true,attendance:{attendedToday:true}};
 const state={authenticated:true,status:'on',slug:celebrity.slug,today:beforeMidnight,
  attendance:{result:{attendanceDate:'2026-11-20'}}};
 useDukjil.mockReturnValue({...state,attendance:undefined});
 const {rerender}=render(<CreatorScheduleCard celebrity={celebrity} locale='ko'/>);
 expect(renderCalendar.mock.lastCall?.[0].attendanceDates.filter(Boolean)).toEqual(['2026-11-19']);
 useDukjil.mockReturnValue({...state,attendance:undefined,today:{...beforeMidnight,kstDate:'2026-11-20',attendance:{attendedToday:false}}});
 rerender(<CreatorScheduleCard celebrity={celebrity} locale='ko'/>);
 expect(renderCalendar.mock.lastCall?.[0].attendanceDates.filter(Boolean)).toEqual([]);
 useDukjil.mockReturnValue(state);
 rerender(<CreatorScheduleCard celebrity={celebrity} locale='ko'/>);
 expect(renderCalendar.mock.lastCall?.[0].attendanceDates).toEqual(['2026-11-20','2026-11-19']);
 useDukjil.mockReturnValue({...state,slug:'another-creator'});
 rerender(<CreatorScheduleCard celebrity={celebrity} locale='ko'/>);
 expect(renderCalendar.mock.lastCall?.[0].attendanceDates.filter(Boolean)).toEqual([]);
 useDukjil.mockReturnValue({...state,authenticated:false});
 rerender(<CreatorScheduleCard celebrity={celebrity} locale='ko'/>);
 expect(renderCalendar.mock.lastCall?.[0].attendanceDates.filter(Boolean)).toEqual([]);
 useDukjil.mockReset();
});
