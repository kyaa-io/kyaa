"use client";
import { useState,type FormEvent } from 'react';
import { z } from 'zod';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import type { GroupMission } from '@/server/group-activities/domain';
import { GroupImageField,imageAssetInput } from "./group-image-field";
import { useActivitySave } from './use-activity-save';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { activitiesCopy } from './activities-copy';
import styles from './groups.module.css';
export {GroupEventEditor} from './group-event-form';
export function GroupMissionEditor({pageId,locale,initial,done=()=>{}}:{pageId:string;locale:AppLocale;initial?:GroupMission;done?:()=>void}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=activitiesCopy(locale),r=useActivitySave(),[imageReady,setImageReady]=useState(true),[submissionKind,setSubmissionKind]=useState(initial?.submissionKind??'text');
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!imageReady)return;const f=new FormData(e.currentTarget);void r.save(`/api/groups/${pageId}/missions${initial?`/${initial.id}`:''}`,initial?'PATCH':'POST',{expectedRevision:initial?.revision,title:f.get('title'),instructions:f.get('instructions'),imageAssetId:imageAssetInput(f),state:f.get('state'),submissionKind,...(submissionKind==='survey'?{surveyQuestion:f.get('surveyQuestion'),surveyOptions:[0,1,2].map(index=>f.get('surveyOption'+index))}:{})},done,value=>z.object({mission:z.object({id:z.uuid()})}).parse(value));};
 return <section className={styles.panel}><h2>{c.createMission}</h2><form className={styles.form} onSubmit={submit}><label className={styles.field}>{m.title}<input name='title' className={styles.input} required maxLength={200} defaultValue={initial?.title} disabled={r.busy}/></label><label className={styles.field}>{m.body}<textarea name='instructions' className={styles.textarea} required maxLength={10000} defaultValue={initial?.instructions} disabled={r.busy}/></label><label className={styles.field}>{locale==='ko'?'제출 방식':'Submission type'}<select className={styles.select} value={submissionKind} disabled={r.busy} onChange={event=>setSubmissionKind(event.target.value as 'text'|'photo'|'survey')}><option value='text'>{locale==='ko'?'글':'Text'}</option><option value='photo'>{locale==='ko'?'사진 인증':'Photo evidence'}</option><option value='survey'>{locale==='ko'?'설문':'Survey'}</option></select></label>{submissionKind==='survey'&&<><label className={styles.field}>{locale==='ko'?'질문':'Question'}<input className={styles.input} name='surveyQuestion' required maxLength={500} defaultValue={initial?.surveyQuestion??''} disabled={r.busy}/></label>{[0,1,2].map(index=><label className={styles.field} key={index}>{locale==='ko'?'선택지':'Option'} {index+1}<input className={styles.input} name={'surveyOption'+index} required maxLength={200} defaultValue={initial?.surveyOptions?.[index]??''} disabled={r.busy}/></label>)}</>}<GroupImageField locale={locale} initialUrl={initial?.imageUrl} disabled={r.busy} onReadyChange={setImageReady}/><select name='state' className={styles.select} defaultValue={initial?.state??'draft'} disabled={r.busy} aria-label={c.missions}><option value='draft'>{c.draft}</option><option value='published'>{c.published}</option><option value='closed'>{c.closed}</option></select>{r.failed&&<p role='alert' className={styles.error}>{t.error}</p>}<FanAction type='submit' disabled={r.busy||!imageReady}>{initial?m.save:c.createMission}</FanAction></form></section>;
}
export {GroupCollectionImportEditor as GroupCollectionEditor} from './group-collection-import';
