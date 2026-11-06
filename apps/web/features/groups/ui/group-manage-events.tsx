"use client";
import {useState} from 'react';
import {ArrowLeft,Check,Plus} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {participationCopy} from '@/i18n/catalogs/features__schedules__ui__participation';
import {eventApprovalCopy,isEventOpen} from '@/features/group-event-approval/event-approval-status';
import type {GroupEvent} from '@/server/group-activities/domain';
import {activitiesCopy} from './activities-copy';
import {groupsCopy} from './copy';
import {GroupEventsList} from './group-activities';
import {GroupEventEditor} from './group-activity-editors';
import {SourceStatePanel} from './source-state-panel';
import {useAddressParam} from './use-address-param';
function savedStatus(event:GroupEvent,locale:AppLocale){
 if(event.state==='draft')return activitiesCopy(locale).draft;
 if(event.state!=='published'||isEventOpen(event))return null;
 return eventApprovalCopy[locale][event.approvalStatus==='rejected'?'rejected':'pending'];
}
/** 운영 관리의 행사 탭. 목록과 만들기 버튼이 있고, 만들기는 같은 자리에서 폼으로 바뀐다. */
export function GroupManageEvents({pageId,pageName,locale}:{pageId:string;pageName?:string;locale:AppLocale}){
 const c=activitiesCopy(locale),t=groupsCopy(locale),[creating,setCreating]=useAddressParam('new'),[round,setRound]=useState(0),[saved,setSaved]=useState<GroupEvent|null|undefined>();
 if(creating)return <div id='events'><FanAction variant='text' leadingIcon={<ArrowLeft/>} onClick={()=>setCreating(null)}>{t.events}</FanAction><GroupEventEditor pageId={pageId} pageName={pageName} locale={locale} done={event=>{setSaved(event??null);setRound(value=>value+1);setCreating(null);}}/></div>;
 return <div id='events'>
  {saved!==undefined&&<SourceStatePanel style={{maxWidth:'none'}} feedback='success' icon={<Check size={32}/>} role='status' title={participationCopy(locale).saved} description={saved?savedStatus(saved,locale):null} actions={saved?[{label:saved.title,href:`/pages/groups/${pageId}/events/${saved.id}?locale=${locale}`}]:[]}/>}
  <div id='group-event-list'><GroupEventsList key={round} pageId={pageId} locale={locale} action={<FanAction variant='primary' leadingIcon={<Plus/>} onClick={()=>{setSaved(undefined);setCreating('1');}}>{c.createEvent}</FanAction>}/></div>
 </div>;
}
