'use client';
import {useId,useRef,useState} from 'react';
import {X,Check,Radio,ChevronRight} from 'lucide-react';
import {AccessibleOverlay} from '@/components/ui/overlay/accessible-overlay';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {groupsCopy} from './copy';
import {managementCopy} from './management-copy';
import {presenceCopy} from './presence-copy';
import styles from './artist-presence-dialog.module.css';
import task from './short-task-overlay.module.css';
import {presencePersonalCopy} from './presence-personal-copy';
import {profileConnectionCopy} from '@/features/group-social/profile-copy';
export function ArtistPresenceDialog({locale,enabled,pending,failed,onClose,onSave,variant='page',previewName}:{locale:AppLocale;enabled:boolean;pending:boolean;failed:boolean;onClose:()=>void;onSave:(enabled:boolean)=>void;variant?:'page'|'my';previewName?:string}){
 const [draft,setDraft]=useState(enabled),title=useId(),initial=useRef<HTMLButtonElement>(null),c=presenceCopy(locale),t=groupsCopy(locale),m=managementCopy(locale),label=locale==='ko'?'접속 상태 공개':c.setting,personal=presencePersonalCopy(locale);
 return <AccessibleOverlay open busy={pending} onClose={()=>{if(!pending)onClose();}} labelledBy={title} initialFocusRef={initial} backdropClassName={task.backdrop} contentClassName={`${task.panel} ${styles.panel} ${variant==='my'?styles.personal:''}`} contentAs='section'><div className={task.handle} aria-hidden='true'/><header className={task.header}><h2 id={title}>{label}</h2><button ref={initial} onClick={onClose} disabled={pending} aria-label={profileConnectionCopy(locale).close}><X size={20}/></button></header><div className={task.body}><div className={styles.setting}><i aria-hidden data-on={draft}/><div className={styles.settingCopy}><strong>{label}</strong></div><button role='switch' aria-checked={draft} aria-label={label} disabled={pending} onClick={()=>setDraft(!draft)}><span aria-hidden data-on={draft}/>{draft?c.on:c.off}</button></div>{variant==='my'&&<section className={styles.preview}><h3>{personal[0]}</h3><div><Radio size={22} aria-hidden/><span>{previewName&&<strong>{previewName}</strong>}<small data-on={draft}>{draft?c.connected:c.off}</small></span><ChevronRight size={18} aria-hidden/></div></section>}{failed&&<p role='alert'>{t.error}</p>}</div><footer className={task.footer}><FanAction onClick={onClose} disabled={pending}>{t.cancel}</FanAction><FanAction variant='primary' trailingIcon={<Check size={18} aria-hidden/>} onClick={()=>onSave(draft)} disabled={pending}>{locale==='ko'?'설정 저장':m.save}</FanAction></footer></AccessibleOverlay>;
}
