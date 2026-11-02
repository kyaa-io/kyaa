'use client';
import{useEffect,useId,useRef,useState}from'react';
import type{AppLocale}from'@/i18n/locales';
import{FanAction,fanActionClassName}from'@/components/fan-ui/fan-action';
import{groupEventApplicationReceiptSchema,type GroupEvent}from'@/server/group-activities/domain';
import{TaskPanel,TaskActions}from'./task-panel';
import{useGroupRequest}from'./use-group-resource';
import{groupsCopy}from'./copy';
import{eventApplicationCopy}from'./event-application-copy';
import styles from'./event-application-dialog.module.css';
export function EventApplicationDialog({pageId,event,participantName,locale,onClose,onSaved}:{pageId:string;event:GroupEvent;participantName:string|null;locale:AppLocale;onClose:()=>void;onSaved:()=>void}){
 const c=eventApplicationCopy[locale],t=groupsCopy(locale),auth=useGroupRequest(),formId=useId(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),operation=useRef<{key:string;requestId:string}|undefined>(undefined),active=useRef(true),pending=useRef<AbortController|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;pending.current?.abort();};},[]);
 async function apply(){if(busy)return;const key=JSON.stringify([auth.ownerKey,pageId,event.id,message]);if(operation.current?.key!==key)operation.current={key,requestId:crypto.randomUUID()};const controller=new AbortController();pending.current=controller;setBusy(true);setFailed(false);try{groupEventApplicationReceiptSchema.parse(await auth.request(`/api/groups/${pageId}/events/${event.id}/applications`,{method:'POST',signal:controller.signal,body:JSON.stringify({requestId:operation.current.requestId,applicationMessage:message})}));if(active.current&&!controller.signal.aborted){operation.current=undefined;onSaved();}}catch{if(active.current&&!controller.signal.aborted)setFailed(true);}finally{if(active.current&&!controller.signal.aborted)setBusy(false);if(pending.current===controller)pending.current=null;}}
 const close=()=>{if(!busy)onClose();};
 return <TaskPanel nodeId='jn589' title={c[0]} width={560} onClose={close} closeLabel={t.cancel} className={styles.dialog} actions={<TaskActions><FanAction disabled={busy} onClick={close}>{t.cancel}</FanAction><button form={formId} type='submit' className={fanActionClassName('primary')} disabled={busy}>{c[3]}</button></TaskActions>}><form id={formId} className={styles.body} onSubmit={event=>{event.preventDefault();void apply();}}><section className={styles.summary}><h3>{event.title}</h3><p><time dateTime={event.startsAt}>{new Date(event.startsAt).toLocaleDateString(locale,{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'})}</time> · {event.location}</p></section><div className={styles.fields}><label className={styles.field}>{c[1]}<input value={participantName??c[4]} readOnly autoComplete='off'/></label><label className={styles.field}>{c[2]}<input type='text' value={message} maxLength={1000} disabled={busy} onChange={event=>setMessage(event.target.value)}/></label></div>{failed&&<p role='alert'>{t.error}</p>}</form></TaskPanel>;
}
