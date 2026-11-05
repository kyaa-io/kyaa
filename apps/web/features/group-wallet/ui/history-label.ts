import type {AppLocale} from '@/i18n/locales';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {groupEarningsCopy} from '@/features/groups/ui/group-earnings-copy';
import {messages as ticketNames} from '@/i18n/catalogs/features__tickets__ui__fan-ticket-history-screen';
import {additionalLocales} from '@/i18n/messages';
import {walletCopy} from './copy';
// Same names the ticket history screen already shows for these earning sources (ko/en inline, other locales from its catalog).
const names={
 verification:{ko:'팬 인증',en:'Fan verification',...additionalLocales(l=>ticketNames.mcb885a4cb68b[l])},
 liveReservation:{ko:'LIVE 예약',en:'LIVE reservation',...additionalLocales(l=>ticketNames.m09bcaad5a36b[l])},
 liveAttendance:{ko:'LIVE 출석',en:'LIVE attendance',...additionalLocales(l=>ticketNames.m7ec41b9e944f[l])},
 missionDone:{ko:'미션 완료',en:'Mission completed',...additionalLocales(l=>ticketNames.maa10a34c3969[l])},
 journeyDone:{ko:'여정 완료',en:'Journey completed',...additionalLocales(l=>ticketNames.m3f0d9491846e[l])},
 refund:{ko:'응모권 환급',en:'Ticket refund',...additionalLocales(l=>ticketNames.m17cce492b47c[l])},
 certified:{ko:'인증 완료',en:'Verification approved',...additionalLocales(l=>ticketNames.ma46534c28efb[l])},
} satisfies Record<string,Record<AppLocale,string>>;
export function walletHistoryLabel(locale:AppLocale,sourceType:string):string|null {
 if(sourceType==='group_check_in')return walletCopy(locale).attendance;
 if(sourceType==='group_exchange')return walletCopy(locale).exchange;
 if(sourceType==='group_capsule')return capsuleCopy(locale).title;
 if(sourceType==='group_raffle_entry'||sourceType==='benefit_entry')return raffleCopy(locale).enter;
 if(sourceType==='group_raffle_refund'||sourceType==='benefit_entry_refund')return names.refund[locale];
 if(sourceType==='passport_verification')return names.verification[locale];
 if(sourceType==='live_reservation')return names.liveReservation[locale];
 if(sourceType==='live_attendance')return names.liveAttendance[locale];
 if(sourceType==='mission_completion')return names.missionDone[locale];
 if(sourceType==='journey_completion')return names.journeyDone[locale];
 if(sourceType==='manual_certification')return names.certified[locale];
 if(sourceType==='group_mission')return groupEarningsCopy(locale).kinds.mission;
 if(sourceType==='activity'||sourceType==='dukjil_action'||sourceType==='live_participation')return groupEarningsCopy(locale).kinds.activity;
 if(sourceType==='exchange'||sourceType==='fan_point_exchange')return walletCopy(locale).exchange;
 return null;
}
