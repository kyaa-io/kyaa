"use client";
import {useState} from 'react';
import {Check} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import {participationCopy} from '@/i18n/catalogs/features__schedules__ui__participation';
import {eventApprovalCopy,isEventOpen} from '@/features/group-event-approval/event-approval-status';
import type {GroupEvent} from '@/server/group-activities/domain';
import {activitiesCopy} from './activities-copy';
import {GroupEventsList} from './group-activities';
import {GroupEventEditor} from './group-activity-editors';
import {SourceStatePanel} from './source-state-panel';
import styles from './groups.module.css';
function savedStatus(event:GroupEvent,locale:AppLocale){
 if(event.state==='draft')return activitiesCopy(locale).draft;
 if(event.state!=='published'||isEventOpen(event))return null;
 return eventApprovalCopy[locale][event.approvalStatus==='rejected'?'rejected':'pending'];
}
export function GroupManageEvents({pageId,locale}:{pageId:string;locale:AppLocale}){
 const c=activitiesCopy(locale),[round,setRound]=useState(0),[saved,setSaved]=useState<GroupEvent|null|undefined>();
 return <>
  <details open id='events' className={styles.panel}><summary>{c.createEvent}</summary><GroupEventEditor key={round} pageId={pageId} locale={locale} done={event=>{setSaved(event??null);setRound(value=>value+1);}}/></details>
  {saved!==undefined&&<SourceStatePanel style={{maxWidth:'none'}} feedback='success' icon={<Check size={32}/>} role='status' title={participationCopy(locale).saved} description={saved?savedStatus(saved,locale):null} actions={saved?[{label:saved.title,href:`/pages/groups/${pageId}/events/${saved.id}?locale=${locale}`}]:[]}/>}
  <div id='group-event-list'><GroupEventsList key={round} pageId={pageId} locale={locale}/></div>
 </>;
}
