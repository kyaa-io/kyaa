"use client";
import { useState,type FormEvent } from 'react';
import { z } from 'zod';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import type { GroupMission } from '@/server/group-activities/domain';
import { AlignLeft,ListChecks } from 'lucide-react';
import { imageAssetInput } from "./group-image-field";
import { ActivityCover } from './group-event-form';
import { manageFormText } from './manage-form-copy';
import form from './group-event-form.module.css';
import { useActivitySave } from './use-activity-save';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { activitiesCopy } from './activities-copy';
export {GroupEventEditor} from './group-event-form';
export function GroupMissionEditor({pageId,locale,initial,pageName,done=()=>{}}:{pageId:string;locale:AppLocale;initial?:GroupMission;pageName?:string;done?:()=>void}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=activitiesCopy(locale),r=useActivitySave(),[imageReady,setImageReady]=useState(true),[submissionKind,setSubmissionKind]=useState(initial?.submissionKind??'text');
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!imageReady)return;const f=new FormData(e.currentTarget);void r.save(`/api/groups/${pageId}/missions${initial?`/${initial.id}`:''}`,initial?'PATCH':'POST',{expectedRevision:initial?.revision,title:f.get('title'),instructions:f.get('instructions'),imageAssetId:imageAssetInput(f),state:f.get('state'),submissionKind,...(submissionKind==='survey'?{surveyQuestion:f.get('surveyQuestion'),surveyOptions:[0,1,2].map(index=>f.get('surveyOption'+index))}:{})},done,value=>z.object({mission:z.object({id:z.uuid()})}).parse(value));};
 return <form className={form.editor} onSubmit={submit}>
  <ActivityCover locale={locale} initialUrl={initial?.imageUrl} disabled={r.busy} onReadyChange={setImageReady}/>
  <div className={form.main}>
   <div className={form.top}>{pageName&&<span className={form.pageName}>{pageName}</span>}<select name='state' className={form.state} defaultValue={initial?.state??'draft'} disabled={r.busy} aria-label={c.missions}><option value='draft'>{c.draft}</option><option value='published'>{c.published}</option><option value='closed'>{c.closed}</option></select></div>
   <input name='title' className={form.title} aria-label={manageFormText(locale,'missionName')} placeholder={manageFormText(locale,'missionName')} required maxLength={200} defaultValue={initial?.title} disabled={r.busy}/>
   <label className={form.group}><span className={form.row} data-start=''><AlignLeft size={20} aria-hidden='true'/><textarea name='instructions' className={form.rowInput} aria-label={manageFormText(locale,'missionBody')} placeholder={manageFormText(locale,'missionBodyAdd')} rows={3} required maxLength={10000} defaultValue={initial?.instructions} disabled={r.busy}/></span></label>
   <h3 className={form.optionsTitle}>{manageFormText(locale,'options')}</h3>
   <div className={form.group}>
    <label className={form.row}><ListChecks size={20} aria-hidden='true'/><span className={form.optionLabel}>{manageFormText(locale,'missionKind')}</span><select className={form.rowSelect} value={submissionKind} disabled={r.busy} onChange={event=>setSubmissionKind(event.target.value as 'text'|'photo'|'survey')}><option value='text'>{manageFormText(locale,'kindText')}</option><option value='photo'>{manageFormText(locale,'kindPhoto')}</option><option value='survey'>{manageFormText(locale,'kindSurvey')}</option></select></label>
    {submissionKind==='survey'&&<><label className={form.row}><span className={form.rowLabel}>{manageFormText(locale,'surveyQuestion')}</span><input className={form.rowInput} name='surveyQuestion' required maxLength={500} defaultValue={initial?.surveyQuestion??''} disabled={r.busy}/></label>{[0,1,2].map(index=><label className={form.row} key={index}><span className={form.rowLabel}>{manageFormText(locale,'surveyOption',[index+1])}</span><input className={form.rowInput} name={'surveyOption'+index} required maxLength={200} defaultValue={initial?.surveyOptions?.[index]??''} disabled={r.busy}/></label>)}</>}
   </div>
   {r.failed&&<p role='alert' className={form.error}>{t.error}</p>}
   <div className={form.actions}><FanAction className={form.submit} variant='primary' type='submit' disabled={r.busy||!imageReady}>{initial?m.save:c.createMission}</FanAction></div>
  </div>
 </form>;
}
export {GroupCollectionImportEditor as GroupCollectionEditor} from './group-collection-import';
