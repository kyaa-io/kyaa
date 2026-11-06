import '@testing-library/jest-dom/vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {EventApprovalStatus,eventApprovalCopy} from './event-approval-status';
afterEach(cleanup);
it('shows the waiting state to staff',()=>{
 render(<EventApprovalStatus locale='ko' status='pending' reason={null}/>);
 expect(screen.getByText('승인 대기')).toBeInTheDocument();
});
it('shows the rejection and its reason',()=>{
 render(<EventApprovalStatus locale='ko' status='rejected' reason='장소가 불분명합니다'/>);
 expect(screen.getByText('반려됨')).toBeInTheDocument();
 expect(screen.getByText('반려 사유')).toBeInTheDocument();
 expect(screen.getByText('장소가 불분명합니다')).toBeInTheDocument();
});
it('adds nothing for approved or older events',()=>{
 const approved=render(<EventApprovalStatus locale='ko' status='approved' reason={null}/>);expect(approved.container).toBeEmptyDOMElement();approved.unmount();
 const older=render(<EventApprovalStatus locale='ko'/>);expect(older.container).toBeEmptyDOMElement();
});
it('has every label in all twelve languages',()=>{
 expect(APP_LOCALES).toHaveLength(12);
 for(const locale of APP_LOCALES){const copy=eventApprovalCopy[locale];expect(copy.pending&&copy.rejected&&copy.reason&&copy.notFound,locale).toBeTruthy();}
 expect(new Set(APP_LOCALES.map(locale=>eventApprovalCopy[locale].pending)).size).toBeGreaterThan(9);
});
