'use client';
import {useId,useRef} from 'react';
import {useRouter} from 'next/navigation';
import type {Route} from 'next';
import {APP_LOCALES,APP_LOCALE_NATIVE_NAMES,type AppLocale} from '@/i18n/locales';
import {withLocalePath} from '@/components/locale-path';
import {AccessibleOverlay} from '@/components/ui/overlay/accessible-overlay';
import {PencilHeaderIcon} from '@/components/fan-shell/pencil-header-icon';
import {profileConnectionCopy} from '@/features/group-social/profile-copy';
import task from './short-task-overlay.module.css';
import styles from './group-header-account.module.css';
export function GroupLanguageDialog({locale,href,onClose}:{locale:AppLocale;href:string;onClose:()=>void}){
 const title=useId(),close=useRef<HTMLButtonElement>(null),router=useRouter(),ko=locale==='ko',languageNames=new Intl.DisplayNames([locale],{type:'language'});
 return <AccessibleOverlay open onClose={onClose} labelledBy={title} initialFocusRef={close} backdropClassName={task.backdrop} contentClassName={`${task.panel} ${styles.dialog}`} contentAs='section'><div className={task.handle} aria-hidden='true'/><header className={task.header}><h2 id={title}>{ko?'언어 선택':'Choose language'}</h2><button ref={close} onClick={onClose} aria-label={profileConnectionCopy(locale).close}><PencilHeaderIcon name='close' size={20}/></button></header><div className={`${task.body} ${styles.languages}`}>{APP_LOCALES.map(option=><button key={option} className={styles.language} aria-pressed={option===locale} onClick={()=>{onClose();if(option!==locale)router.push(withLocalePath(href,option) as Route);}}><span><strong>{APP_LOCALE_NATIVE_NAMES[option]}</strong><small>{option===locale?(ko?'선택됨':'Selected'):ko&&option==='zh-Hans'?'중국어 · 간체':ko&&option==='zh-Hant'?'중국어 · 번체':languageNames.of(option)}</small></span>{option===locale&&<PencilHeaderIcon name='check' size={18}/>}</button>)}</div></AccessibleOverlay>;
}
