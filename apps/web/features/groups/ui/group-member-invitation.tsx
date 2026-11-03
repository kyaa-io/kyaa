'use client';
import {useRef,useState} from 'react';
import type {AppLocale} from '@/i18n/locales';
import {FanAction} from '@/components/fan-ui/fan-action';
import {TaskPanel,TaskActions} from './task-panel';
import {useGroupRequest} from './use-group-resource';
import {groupsCopy} from './copy';
import {groupInvitationCopy} from './group-invitation-copy';
import {profileConnectionCopy} from '@/features/group-social/profile-copy';
import {invitationEmailSchema,invitationReceiptSchema} from '@/server/group-invitations/domain';
import styles from './group-membership-invitation.module.css';
export function GroupMemberInvitationDialog({pageId,locale,onClose}:{pageId:string;locale:AppLocale;onClose:()=>void}){
 const c=groupInvitationCopy(locale),t=groupsCopy(locale),r=useGroupRequest(),[email,setEmail]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(false),[queued,setQueued]=useState(false),operation=useRef<{key:string;id:string}|undefined>(undefined),form=useRef<HTMLFormElement>(null);
 async function submit(){if(pending)return;const key=email.trim().toLowerCase();if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};setPending(true);setError(false);try{invitationReceiptSchema.parse(await r.request(`/api/groups/${pageId}/invitations`,{method:'POST',body:JSON.stringify({email:key,locale,requestId:operation.current.id})}));setQueued(true);}catch{setError(true);}finally{setPending(false);}}
 return <TaskPanel title={c.invite} width={560} closeLabel={profileConnectionCopy(locale).close} onClose={()=>{if(!pending)onClose();}} className={styles.panel} actions={<TaskActions className={styles.actions}><FanAction onClick={onClose} disabled={pending}>{queued?profileConnectionCopy(locale).close:t.cancel}</FanAction>{!queued&&<FanAction variant='primary' disabled={pending||!invitationEmailSchema.safeParse(email).success} onClick={()=>form.current?.requestSubmit()}>{c.send}</FanAction>}</TaskActions>}>{queued?<div className={styles.body}><p role='status'>{c.queued}</p></div>:<form ref={form} className={styles.body} onSubmit={event=>{event.preventDefault();void submit();}}><label className={styles.field}>{c.contact}<input type='email' required maxLength={254} value={email} disabled={pending} placeholder={c.email} onChange={e=>setEmail(e.target.value)}/></label><p className={styles.note}>{c.note}</p>{error&&<p role='alert'>{t.error}</p>}</form>}</TaskPanel>;
}
