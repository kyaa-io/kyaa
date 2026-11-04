"use client";
import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {FanAppBottomNavigation,FanAppHeader} from '@/components/fan-shell/fan-app-shell';
import {TaskActions,TaskPanel} from './task-panel';
import {sourceDiscardConfirmation} from './source-confirm-dialog';
import {qualificationSupplementCopy} from './qualification-supplement-copy';
import {FanAction} from '@/components/fan-ui/fan-action';
import {useWaveMediaUpload} from '@/features/content-safety/ui/use-wave-media-upload';
import type {AppLocale} from '@/i18n/locales';
import {qualificationSchema,type GroupQualification} from '../domain/qualification';
import {applicationReceiptSchema} from '../domain/contracts';
import {useGroupRequest} from './use-group-resource';
import {GroupImage} from './group-image';
import {groupsCopy} from './copy';
import {managementCopy} from './management-copy';
import {qualificationCopy,qualificationKinds} from './qualification-copy';
import styles from './group-qualification.module.css';
export type QualificationApplication={id:string;kind:'fan'|'hobby'|'brand';qualification:GroupQualification;submissionRevision:number};
export function GroupQualificationScreen({locale,initialKind='hobby'}:{locale:AppLocale;initialKind?:'fan'|'hobby'|'brand'}){
 const c=qualificationCopy(locale),auth=useGroupRequest();
 return <div className={styles.screen} data-fan-surface lang={locale}><FanAppHeader locale={locale} currentPath='/pages/groups/apply' groupsEnabled/><header className={styles.context}><h1>{c[0]}</h1><p>{c[1]}</p></header><main className={styles.main}><h2>{c[2]}</h2><GroupQualificationForm key={auth.ownerKey} locale={locale} initialKind={initialKind}/></main><FanAppBottomNavigation locale={locale} currentPath='/pages/groups/apply' groupsEnabled/></div>;
}
export function GroupQualificationForm({locale,initialKind='hobby',application,onSaved,supplement,allowedKinds,onStateChange,baseApplication,externalFormId}:{supplement?:{status:string;reason:string|null;onClose:()=>void};locale:AppLocale;initialKind?:'fan'|'hobby'|'brand';application?:QualificationApplication;onSaved?:()=>void;baseApplication?:{kind:"fan"|"hobby"|"brand";name:string;description:string;question?:string;imageAssetId?:string|null};allowedKinds?:readonly ("fan"|"hobby"|"brand")[];onStateChange?:(state:{dirty:boolean;pending:boolean;failedUploads:boolean})=>void;externalFormId?:string}){
 const c=qualificationCopy(locale),t=groupsCopy(locale),m=managementCopy(locale),sc=qualificationSupplementCopy(locale),generatedFormId=useId(),formId=externalFormId??generatedFormId,inFlight=useRef(false),[discard,setDiscard]=useState(false),task=Boolean(application&&supplement),auth=useGroupRequest(),uploads=useWaveMediaUpload('group_image',3),operation=useRef<{body:string;id:string}|undefined>(undefined),[retained,setRetained]=useState(application?.qualification.assetIds??[]),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[done,setDone]=useState(false),[dirty,setDirty]=useState(false);
 const failedUploads=uploads.items.some(item=>item.failed);
 useEffect(()=>{onStateChange?.({dirty:dirty&&!done,pending:busy||uploads.busy,failedUploads});},[dirty,done,busy,uploads.busy,failedUploads,onStateChange]);
 useEffect(()=>{if(!dirty||done)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,done]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current||busy||uploads.busy||uploads.items.some(item=>item.failed)||uploads.items.length>0&&!uploads.ready)return;
  const data=new FormData(event.currentTarget);inFlight.current=true;setFailed(false);
  try{
   const qualification=qualificationSchema.parse({communityName:data.get('name'),evidenceUrl:data.get('evidenceUrl'),introduction:data.get('introduction'),assetIds:[...retained,...uploads.items.map(item=>item.assetId)]});
   const payload={...(baseApplication??{kind:data.get('kind'),name:qualification.communityName,description:qualification.introduction.slice(0,1000)}),qualification,...(application?{expectedRevision:application.submissionRevision}:{})};
   const body=JSON.stringify(payload);if(operation.current?.body!==body)operation.current={body,id:crypto.randomUUID()};setBusy(true);
   applicationReceiptSchema.parse(await auth.request(application?`/api/groups/applications/${application.id}`:'/api/groups/applications',{method:application?'PATCH':'POST',body:JSON.stringify({...payload,requestId:operation.current.id})}));
   for(const item of uploads.items)uploads.markUsed(item.key);setDirty(false);setDone(true);supplement?.onClose();onSaved?.();
  }catch{setFailed(true);}finally{inFlight.current=false;setBusy(false);}
 }
 if(!auth.authenticated)return <div className={styles.status}><FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/apply?qualification=1&locale=${locale}${allowedKinds?`&kind=${initialKind}`:""}`)}`}>{t.login}</FanAction></div>;
 if(done)return <div role='status' className={styles.status}><p>{t.received}</p><FanAction href={`/pages/groups/apply?locale=${locale}`}>{t.myPages}</FanAction></div>;
 const close=()=>{if(busy||uploads.busy)return;if(dirty)setDiscard(true);else supplement?.onClose();};
 const evidence=<div className={styles.evidence}><span>{task?sc[4]:c[9]}</span>{retained.length>0&&<div className={styles.images}>{retained.map(id=><div className={styles.image} key={id}><GroupImage locale={locale} src={`/api/groups/images/${id}`} alt='' width={120} height={90}/><FanAction disabled={busy} onClick={()=>{setRetained(current=>current.filter(value=>value!==id));setDirty(true);}}>{m.remove}</FanAction></div>)}</div>}{uploads.items.map(item=><div className={styles.image} key={item.key}><span>{item.file.name}</span>{item.failed?<FanAction disabled={busy} onClick={()=>uploads.retry(item)}>{t.retry}</FanAction>:!uploads.ready?<span role='status'>{t.loading}</span>:null}<FanAction disabled={busy} onClick={()=>{uploads.remove(item.key);setDirty(true);}}>{m.remove}</FanAction></div>)}<label className={styles.fileButton}>{task?sc[5]:c[10]}<input type='file' accept='image/jpeg,image/png,image/webp' multiple disabled={busy||uploads.busy||retained.length+uploads.items.length>=3} onChange={event=>{uploads.add(Array.from(event.currentTarget.files??[]).slice(0,3-retained.length-uploads.items.length));event.currentTarget.value='';setDirty(true);}}/></label>{uploads.invalid&&<p role='alert'>{t.error}</p>}</div>;
 const form=<form id={formId} className={task?styles.supplementBody:styles.form} onSubmit={submit} onChange={()=>setDirty(true)}>{task&&application?<>
  <input type='hidden' name='kind' value={application.kind}/><input type='hidden' name='name' value={application.qualification.communityName}/><input type='hidden' name='evidenceUrl' value={application.qualification.evidenceUrl}/>
  <section className={styles.supplementSummary}><h3>{sc[1]}</h3><p>{supplement!.status}</p></section>
  {supplement!.reason&&<section className={styles.supplementSummary}><h3>{sc[2]}</h3><p>{supplement!.reason}</p></section>}
  <label className={styles.field}>{sc[3]}<textarea name='introduction' required maxLength={2000} placeholder={sc[9]} defaultValue={application.qualification.introduction} disabled={busy}/></label>
  {evidence}<section className={styles.supplementSummary}><h3>{sc[6]}</h3><p>{sc[7]}</p></section>
 </>:<><section className={styles.section}><h3>{c[3]}</h3>{allowedKinds?.length===1?<input type='hidden' name='kind' value={allowedKinds[0]}/>:<label className={styles.field}>{c[4]}<select name='kind' defaultValue={application?.kind??initialKind} disabled={busy}>{(['hobby','fan','brand'] as const).map((kind,index)=>!allowedKinds||allowedKinds.includes(kind)?<option key={kind} value={kind}>{qualificationKinds(locale)[index]}</option>:null)}</select></label>}<label className={styles.field}>{c[5]}<input name='name' required maxLength={100} placeholder={c[13]} defaultValue={application?.qualification.communityName} disabled={busy}/></label></section><section className={styles.section}><h3>{c[6]}</h3><label className={styles.field}>{c[7]}<input name='evidenceUrl' type='url' required maxLength={2048} placeholder={c[14]} defaultValue={application?.qualification.evidenceUrl} disabled={busy}/></label><label className={styles.field}>{c[8]}<textarea name='introduction' required maxLength={2000} placeholder={c[15]} defaultValue={application?.qualification.introduction} disabled={busy}/></label>{evidence}</section><p className={styles.note}>{c[12]}</p></>}{failed&&<p role='alert'>{t.error}</p>}{!task&&!externalFormId&&<FanAction className={styles.submit} type='submit' variant='primary' disabled={busy||uploads.busy||uploads.items.some(item=>item.failed)}>{busy?t.loading:baseApplication?t.apply:c[11]}</FanAction>}</form>;
 if(!task)return form;
 return <TaskPanel confirmation={discard?sourceDiscardConfirmation({locale,pending:busy||uploads.busy,onContinue:()=>setDiscard(false),onDiscard:()=>supplement?.onClose()}):undefined} nodeId='CDOu1' title={sc[0]} width={640} mode='fullscreen' closeLabel={t.cancel} onClose={close} actions={<TaskActions className={styles.supplementActions}><FanAction disabled={busy||uploads.busy} onClick={close}>{t.cancel}</FanAction><button type='submit' form={formId} className={styles.supplementSubmit} disabled={busy||uploads.busy||uploads.items.some(item=>item.failed)}>{busy?t.loading:sc[8]}</button></TaskActions>}>{form}</TaskPanel>;
}
