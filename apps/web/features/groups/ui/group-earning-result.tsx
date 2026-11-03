'use client';
import type {AppLocale} from '@/i18n/locales';
import {FanAction} from '@/components/fan-ui/fan-action';
import {groupEarningDetailSchema} from '../domain/earnings';
import {GroupShell} from './group-shell';
import {GroupActivityHeader} from './group-activity-header';
import {useGroupRequest,useGroupResource} from './use-group-resource';
import {GroupEarningsState} from './group-earnings-screen';
import {groupEarningsCopy,groupEarningsHref,groupEarningTitle} from './group-earnings-copy';
import styles from './group-earnings.module.css';
const parse=(value:unknown)=>groupEarningDetailSchema.parse(value);
export function GroupEarningResult({pageId,entryKey,locale,cursor}:{pageId:string;entryKey:string;locale:AppLocale;cursor?:string}){
 const auth=useGroupRequest(),r=useGroupResource(auth.ready&&auth.authenticated?`/api/groups/${pageId}/earnings/${encodeURIComponent(entryKey)}`:null,parse),c=groupEarningsCopy(locale),entry=r.data?.entry;
 return <GroupShell locale={locale}><GroupActivityHeader pageId={pageId} locale={locale}/><section className={styles.content} data-group-earning-result aria-labelledby='earning-result-title'>
  <h1 id='earning-result-title'>{c.result}</h1>
  <GroupEarningsState resource={r} locale={locale} returnTo={groupEarningsHref(pageId,locale,cursor,entryKey)}>
   {entry&&<><div className={styles.fact}><h2>{c.activity}</h2><p>{groupEarningTitle(entry,locale)}</p></div>
    <div className={styles.fact}><h2>{c.statuses[entry.status]}</h2><p>{entry.reason??(entry.status==='corrected'?c.correctionNoReason:c.noReason)}</p></div>
    <div className={`${styles.fact} ${styles.time}`}><h2>{c.processed}</h2><p>{entry.processedAt?<time dateTime={entry.processedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(entry.processedAt))}</time>:c.unknown}</p></div>
   </>}
  </GroupEarningsState>
  <FanAction variant='primary' className={styles.back} href={groupEarningsHref(pageId,locale,cursor)}>{c.back}</FanAction>
 </section></GroupShell>;
}
