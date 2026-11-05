import {expect,it} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {walletHistoryLabel} from './history-label';
it('labels known ledger reasons in every locale without inventing an unknown reason',()=>{
 for(const locale of APP_LOCALES)for(const source of ['group_check_in','group_exchange','group_capsule','group_raffle_entry','group_raffle_refund','dukjil_action','group_mission','live_attendance','live_reservation','passport_verification','mission_completion','journey_completion','manual_certification','activity','fan_point_exchange'])expect(walletHistoryLabel(locale,source)).toBeTruthy();
 expect(walletHistoryLabel('ko','group_raffle_refund')).toBe('응모권 환급');
 expect(walletHistoryLabel('ko','passport_verification')).toBe('팬 인증');
 expect(walletHistoryLabel('ko','group_mission')).toBe('미션 참여');
 expect(walletHistoryLabel('ko','dukjil_action')).toBe('활동 참여');
 expect(walletHistoryLabel('ko','live_participation')).toBeNull();
 expect(walletHistoryLabel('ko','unknown_legacy_source')).toBeNull();
});
