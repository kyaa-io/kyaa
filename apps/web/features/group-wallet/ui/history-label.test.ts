import {expect,it} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {walletHistoryLabel} from './history-label';
it('labels known ledger reasons in every locale without inventing an unknown reason',()=>{
 for(const locale of APP_LOCALES)for(const source of ['group_check_in','group_exchange','group_capsule','group_raffle_entry','group_raffle_refund'])expect(walletHistoryLabel(locale,source)).toBeTruthy();
 expect(walletHistoryLabel('ko','group_raffle_refund')).toBe('응모권 반환');
 expect(walletHistoryLabel('ko','unknown_legacy_source')).toBeNull();
});
