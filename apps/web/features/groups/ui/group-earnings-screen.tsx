'use client';
import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import {FanAction} from '@/components/fan-ui/fan-action';
import {groupEarningsSchema} from '../domain/earnings';
import {groupDetailSchema} from '../domain/contracts';
import {GroupShell} from './group-shell';
import {GroupActivityHeader} from './group-activity-header';
import {useGroupRequest,useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {groupEarningsCopy,groupEarningsHref,groupEarningAmount,groupEarningTitle} from './group-earnings-copy';
import styles from './group-earnings.module.css';
const parse=(value:unknown)=>groupEarningsSchema.parse(value);
const parseGroup=(value:unknown)=>groupDetailSchema.parse(value);

export function GroupEarningsState({resource,locale,returnTo,children}:{resource:Pick<ReturnType<typeof useGroupResource<unknown>>,'ready'|'authenticated'|'loading'|'error'|'failure'|'retry'>;locale:AppLocale;returnTo:string;children:ReactNode}){
 const t=groupsCopy(locale),c=groupEarningsCopy(locale);
 if(!resource.ready)return <p role='status'>{t.loading}</p>;
 if(!resource.authenticated||resource.failure?.status===401)return <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{t.login}</FanAction>;
 if(resource.error){const unavailable=[403,404].includes(resource.failure?.status??0);return <><p className={styles.error} role='alert'>{unavailable?c.unavailable:c.error}</p>{!unavailable&&<FanAction className={styles.retry} onClick={resource.retry}>{c.reload}</FanAction>}</>;}
 if(resource.loading)return <p role='status'>{t.loading}</p>;
 return children;
}
export function GroupEarningsScreen({pageId,locale,cursor}:{pageId:string;locale:AppLocale;cursor?:string}){
 const auth=useGroupRequest(),query=new URLSearchParams({limit:'30'});if(cursor)query.set('cursor',cursor);
 const r=useGroupResource(auth.ready&&auth.authenticated?`/api/groups/${pageId}/earnings?${query}`:null,parse);
 const group=useGroupResource(`/api/groups/${pageId}`,parseGroup),c=groupEarningsCopy(locale),t=groupsCopy(locale);
 const listHref=groupEarningsHref(pageId,locale,cursor);
 return <GroupShell locale={locale}><GroupActivityHeader pageId={pageId} locale={locale}/><section className={styles.content} data-group-earnings aria-labelledby='earnings-title'>
  <h1 id='earnings-title'>{c.title}</h1>
  <div className={styles.scope}><span id='earnings-scope-label'>{c.scope}</span><div className={styles.scopeValue} aria-labelledby='earnings-scope-label'><span>{group.data?.page.name??c.currentGroup} · {c.all}</span><ChevronDown aria-hidden='true' size={18}/></div></div>
  <GroupEarningsState resource={r} locale={locale} returnTo={listHref}>
   {!r.data?.entries.length?<><p className={styles.empty}>{c.empty}</p><FanAction className={styles.retry} href={`/pages/groups/${pageId}/missions?locale=${locale}`}>{t.activities}</FanAction></>:<ul className={styles.list}>{r.data.entries.map(entry=>{const amount=groupEarningAmount(entry,locale),hasDetail=['corrected','correction_review','refunded','rejected'].includes(entry.status);return <li className={styles.row} data-status={entry.status} key={entry.entryKey}>
    <div className={styles.rowCopy}><h2>{groupEarningTitle(entry,locale)}</h2><p>{c.statuses[entry.status]}</p></div>
    {amount!==null&&<strong className={styles.amount}>{amount}</strong>}
    {hasDetail&&<FanAction className={styles.detail} href={groupEarningsHref(pageId,locale,cursor,entry.entryKey)} ariaLabel={`${c.detail}: ${groupEarningTitle(entry,locale)}`}>{c.detail}</FanAction>}
   </li>;})}</ul>}
   {r.data?.nextCursor&&<FanAction className={styles.retry} href={groupEarningsHref(pageId,locale,r.data.nextCursor)}>{t.more}</FanAction>}
  </GroupEarningsState>
 </section></GroupShell>;
}
