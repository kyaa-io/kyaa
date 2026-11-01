"use client";
import { GroupImage } from "./group-image";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import { groupEventDetailSchema, groupTicketSchema } from '@/server/group-activities/domain';
import type { AppLocale } from '@/i18n/locales';
import { groupDetailSchema } from "../domain/contracts";
import { GroupShell } from './group-shell';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { activitiesCopy } from './activities-copy';
import { GroupEventOperations } from "./group-event-operations";
import { GroupEventEditor } from './group-activity-editors';
import styles from './groups.module.css';
const parsePage=(v:unknown)=>groupDetailSchema.parse(v);
const parseEvent=(v:unknown)=>groupEventDetailSchema.parse(v),parseTicket=(v:unknown)=>groupTicketSchema.parse(v);
function EventQr({value,label,errorLabel,retryLabel}:{value:string;label:string;errorLabel:string;retryLabel:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;void import('qrcode').then(({toCanvas})=>{if(active&&canvas.current)return toCanvas(canvas.current,value,{width:240,margin:4,errorCorrectionLevel:'M'});}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[value,attempt]);
 return failed?<div role='alert'><p>{errorLabel}</p><FanAction onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>{retryLabel}</FanAction></div>:<canvas ref={canvas} role='img' aria-label={label} style={{width:240,maxWidth:'100%',height:'auto'}}/>;
}
export function GroupEventScreen({pageId,eventId,locale}:{pageId:string;eventId:string;locale:AppLocale}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=activitiesCopy(locale),base=`/api/groups/${pageId}/events/${eventId}`,r=useGroupResource(base,parseEvent),ticket=useGroupResource(r.data?.event.ticketAvailable?`${base}/ticket`:null,parseTicket);
 const membership=useGroupResource(r.authenticated?`/api/groups/${pageId}`:null,parsePage);
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const operation=useRef<{key:string;requestId:string}|undefined>(undefined);
 async function mutate(path:string,method:string,input:Record<string,unknown>={}){if(busy)return;const key=JSON.stringify([path,method,input]);if(operation.current?.key!==key)operation.current={key,requestId:crypto.randomUUID()};setBusy(true);setFailed(false);try{await r.request(`${base}${path}`,{method,body:JSON.stringify({...input,requestId:operation.current.requestId})});operation.current=undefined;r.retry();ticket.retry();}catch{setFailed(true);}finally{setBusy(false);}}
 const submitText=(e:FormEvent<HTMLFormElement>,path:string,field:string)=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(path,'POST',{[field]:f.get(field)});};
 if(!r.data)return <GroupShell locale={locale}><section className={styles.status}><p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</section></GroupShell>;
 const d=r.data,e=d.event;
 return <GroupShell locale={locale}><header className={styles.identity}><CalendarDays aria-hidden='true'/><h1>{e.title}</h1>{d.canManage&&<FanAction onClick={()=>setEditing(!editing)}>{m.manage}</FanAction>}</header>{editing?<GroupEventEditor pageId={pageId} locale={locale} initial={e} done={()=>{setEditing(false);r.retry();}}/>:<div className={`${styles.layout} ${styles.eventLayout}`}><div className={styles.form}><section className={`${styles.panel} ${styles.eventSummary}`}>{e.imageUrl&&<GroupImage locale={locale} src={e.imageUrl} alt='' className={styles.eventImage}/>}<div className={styles.form}><p style={{whiteSpace:'pre-wrap'}}>{e.description}</p><p><CalendarDays size={18} aria-hidden='true'/> <time dateTime={e.startsAt}>{new Date(e.startsAt).toLocaleString(locale,{dateStyle:"medium",timeStyle:"short"})}</time></p><p><MapPin size={18} aria-hidden='true'/> {e.location}</p></div></section>
 {d.canReview&&<section className={styles.panel}><h2>{c.review}</h2><form className={styles.form} onSubmit={event=>submitText(event,'/review','body')}><textarea className={styles.textarea} name='body' aria-label={c.review} required maxLength={5000} disabled={busy}/><FanAction type='submit' disabled={busy}>{c.review}</FanAction></form></section>}
 {d.canManage&&<GroupEventOperations key={r.ownerKey} pageId={pageId} eventId={eventId} locale={locale} refresh={()=>{r.retry();ticket.retry();}}/>}
 </div><aside className={styles.aside}> {ticket.data&&<section className={styles.panel}><h2>{c.ticket}</h2><EventQr value={ticket.data.qrPayload} label={c.ticket} errorLabel={t.error} retryLabel={t.retry}/>{ticket.data.status==='checked_in'&&<p>{c.completed}</p>}</section>}{ticket.error&&<FanAction onClick={ticket.retry}>{t.retry}</FanAction>}
{e.state==='cancelled'?<p>{c.cancel}</p>:e.state==='ended'||now>=Date.parse(e.closesAt)?<p>{c.closed}</p>:null}{d.participation.status!=='none'&&<p>{d.participation.status==='confirmed'?c.confirmed:d.participation.status==='pending'?c.pending:d.participation.status==='rejected'?c.rejected:c.cancel}</p>}{!r.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}/events/${eventId}?locale=${locale}`)}`}>{t.login}</FanAction>:<>{membership.data&&!membership.data.membership&&<FanAction href={`/pages/groups/${pageId}?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}/events/${eventId}?locale=${locale}`)}`}>{t.join}</FanAction>}{d.canApply&&<FanAction variant='primary' disabled={busy} onClick={()=>void mutate('/applications','POST')}>{c.apply}</FanAction>}{['pending','confirmed'].includes(d.participation.status)&&<FanAction disabled={busy||Boolean(d.participation.checkedInAt)} onClick={()=>void mutate('/applications','DELETE')}>{c.cancel}</FanAction>}</>}{failed&&<p role='alert' className={styles.error}>{t.error}</p>}</aside></div>}</GroupShell>;
}
