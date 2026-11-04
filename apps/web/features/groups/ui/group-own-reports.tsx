'use client';
import {useState} from 'react';
import {ReportReceivedIcon,ReportResultIcon} from './group-own-report-icons';
import type {AppLocale} from '@/i18n/locales';
import {FanAppFrame} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {groupOwnReportsSchema} from '../domain/contracts';
import {useGroupRequest,useGroupResource} from './use-group-resource';
import {SourceStatePanel} from './source-state-panel';
import {groupsCopy} from './copy';
import {groupOwnReportsCopy} from './group-own-reports-copy';
import styles from './group-own-reports.module.css';
const parse=(value:unknown)=>groupOwnReportsSchema.parse(value);
type Report=ReturnType<typeof parse>['items'][number];
export function GroupOwnReports({locale}:{locale:AppLocale}){const auth=useGroupRequest();return <OwnReports key={auth.ownerKey} locale={locale}/>;}
function OwnReports({locale}:{locale:AppLocale}){
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<Report[]>([]),[expanded,setExpanded]=useState<string[]>([]),r=useGroupResource(`/api/groups/my/reports${cursor?`?cursor=${cursor}`:''}`,parse),c=groupOwnReportsCopy(locale),t=groupsCopy(locale),rows=[...previous,...(r.data?.items??[])];
 return <FanAppFrame locale={locale} groupsEnabled currentPath='/my' mainId='own-reports'><main id='own-reports' className={styles.page}><h1>{c[0]}</h1>{!r.ready?<p role='status'>{t.loading}</p>:!r.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/groups/reports?locale=${locale}`)}`}>{t.login}</FanAction>:r.error?<SourceStatePanel title={t.error} role='alert' actions={[{label:t.retry,onClick:r.retry}]}/>:<>{rows.map(item=><article className={styles.report} key={item.id}><SourceStatePanel sourceId='XlbOv' className={styles.panel} icon={<ReportReceivedIcon/>} title={c[item.status==='resolved'?6:item.status==='action_requested'?5:item.status==='reviewing'?4:3]} description={<p>{c[7]} · {item.reason}</p>} actions={item.targetPath?[{label:c[9],href:`${item.targetPath}&locale=${locale}`}]:[]}><time className={styles.date} dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale)}</time></SourceStatePanel>{(item.resolution||item.status!=='submitted')&&<SourceStatePanel sourceId='AYzQG' className={styles.panel} icon={<ReportResultIcon/>} title={c[1]}><FanAction className={styles.resultAction} aria-expanded={expanded.includes(item.id)} aria-controls={`result-${item.id}`} onClick={()=>setExpanded(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):[...ids,item.id])}>{locale==='ko'?'신고 결과와 사유 보기':c[1]}</FanAction>{expanded.includes(item.id)&&<dl id={`result-${item.id}`} className={styles.result}><dt>{c[1]}</dt><dd>{c[item.status==='resolved'?6:item.status==='action_requested'?5:item.status==='reviewing'?4:3]}</dd>{item.resolution&&<><dt>{c[8]}</dt><dd>{item.resolution}</dd></>}</dl>}</SourceStatePanel>}</article>)}{r.loading?<p role='status'>{t.loading}</p>:!rows.length?<p>{t.empty}</p>:null}{r.data?.nextCursor&&<FanAction onClick={()=>{setPrevious(rows);setCursor(r.data!.nextCursor!);}}>{t.more}</FanAction>}</>}</main></FanAppFrame>;
}
