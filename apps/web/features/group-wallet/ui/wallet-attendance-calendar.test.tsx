import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {WalletAttendanceCalendar} from './wallet-attendance-calendar';
it('aligns the month and shows only recorded stamps including the seventh-day bonus',()=>{
 const view=render(<WalletAttendanceCalendar locale="ko" today="2026-10-15" days={[{date:'2026-10-14',points:30},{date:'2026-10-15',points:10},{date:'2026-09-30',points:10}]}/>);
 expect(screen.getAllByRole('listitem')).toHaveLength(31);
 expect(screen.getAllByRole('listitem')[0]).toHaveStyle({gridColumnStart:5});
 expect(view.container.querySelector('time[aria-current="date"]')).toHaveAttribute('datetime','2026-10-15');
 expect(view.container.querySelectorAll('[data-complete="true"]')).toHaveLength(2);
 expect(screen.getByText('30P')).toBeInTheDocument();
});
it('renders February in a leap year without inventing attendance',()=>{
 render(<WalletAttendanceCalendar locale="en" today="2028-02-01" days={[]}/>);
 expect(screen.getAllByRole('listitem')).toHaveLength(29);
 expect(screen.queryByText('10P')).not.toBeInTheDocument();
});
