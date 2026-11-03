import type {AppLocale} from '@/i18n/locales';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {walletCopy} from './copy';
const refund:Record<AppLocale,string>={ko:'응모권 반환',en:'Ticket refund',ja:'応募券返還','zh-Hans':'抽奖券退还','zh-Hant':'抽獎券退還',es:'Devolución de boletos',id:'Pengembalian tiket',vi:'Hoàn vé',th:'คืนตั๋ว',pt:'Devolução de bilhetes',fr:'Remboursement de tickets',ru:'Возврат билетов'};
export function walletHistoryLabel(locale:AppLocale,sourceType:string):string|null {
 if(sourceType==='group_check_in')return walletCopy(locale).attendance;
 if(sourceType==='group_exchange')return walletCopy(locale).exchange;
 if(sourceType==='group_capsule')return capsuleCopy(locale).title;
 if(sourceType==='group_raffle_entry'||sourceType==='benefit_entry')return raffleCopy(locale).enter;
 if(sourceType==='group_raffle_refund'||sourceType==='benefit_entry_refund')return refund[locale];
 return null;
}
