"use client";
import {useEffect,useId,useState} from 'react';
import type {AppLocale} from '@/i18n/locales';
import {FanAction,fanActionClassName} from '@/components/fan-ui/fan-action';
import {TaskActions,TaskPanel} from './task-panel';
import {groupsCopy} from './copy';
import {managementCopy} from './management-copy';
import {interactionCopy} from './interaction-copy';
export function GroupTextTask({locale,title,label,initialValue='',submitLabel,maxLength,busy,failed,onSubmit,onClose}:{locale:AppLocale;title:string;label:string;initialValue?:string;submitLabel:string;maxLength:number;busy:boolean;failed:boolean;onSubmit:(body:string)=>Promise<boolean>;onClose:()=>void}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=interactionCopy(locale),id=useId(),[body,setBody]=useState(initialValue),[discard,setDiscard]=useState(false),dirty=body!==initialValue;
 useEffect(()=>{if(!dirty)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 const close=()=>{if(busy)return;if(discard)setDiscard(false);else if(dirty)setDiscard(true);else onClose();};
 return <TaskPanel title={discard?c.discard:title} width={discard?560:640} mode='fullscreen' onClose={close} closeLabel={t.cancel} className='groupTextTask' actions={<TaskActions>{discard?<><FanAction onClick={()=>setDiscard(false)}>{t.cancel}</FanAction><FanAction variant='primary' onClick={onClose}>{m.remove}</FanAction></>:<><FanAction disabled={busy} onClick={close}>{t.cancel}</FanAction><button type='submit' form={id} className={fanActionClassName('primary')} disabled={busy}>{submitLabel}</button></>}</TaskActions>}>
 {discard?<div className='groupTextTaskBody'><p>{c.discard}</p></div>:<form id={id} className='groupTextTaskBody' onSubmit={event=>{event.preventDefault();if(!busy)void onSubmit(body).then(saved=>{if(saved)onClose();});}}><label>{label}<textarea name='body' required maxLength={maxLength} value={body} disabled={busy} onChange={event=>setBody(event.target.value)}/></label>{failed&&<p role='alert'>{t.error}</p>}</form>}
 </TaskPanel>;
}
