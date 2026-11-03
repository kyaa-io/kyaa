'use client';
import {useState} from 'react';
import {z} from 'zod';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {groupsCopy} from './copy';
import {TaskPanel,TaskActions} from './task-panel';
import {groupNotificationSettingsCopy} from './group-notification-settings-copy';
import styles from './group-notification-settings.module.css';
import {profileConnectionCopy} from '@/features/group-social/profile-copy';
export const groupNotificationKeys=['notices','events','recipients','activity'] as const;
export const groupNotificationSettingsSchema=z.object({enabled:z.boolean(),notices:z.boolean().default(true),events:z.boolean().default(true),recipients:z.boolean().default(true),activity:z.boolean().default(true)});
export type GroupNotificationSettings=z.infer<typeof groupNotificationSettingsSchema>;
export type GroupNotificationCategories=Pick<GroupNotificationSettings,typeof groupNotificationKeys[number]>;
export function effectiveGroupNotificationSettings(settings:GroupNotificationSettings):GroupNotificationCategories{return Object.fromEntries(groupNotificationKeys.map(key=>[key,settings.enabled&&settings[key]])) as GroupNotificationCategories;}
export function GroupNotificationSettingsDialog({locale,pageName,settings,pending,failed,saved=false,onChange,onClose,onSave}:{locale:AppLocale;pageName:string;settings:GroupNotificationSettings;pending:boolean;failed:boolean;saved?:boolean;onChange?:()=>void;onClose:()=>void;onSave:(draft:GroupNotificationCategories)=>void}){
 const [draft,setDraft]=useState(()=>effectiveGroupNotificationSettings(settings)),t=groupsCopy(locale),c=groupNotificationSettingsCopy(locale);
 return <TaskPanel title={c.title} width={560} closeLabel={profileConnectionCopy(locale).close} onClose={()=>{if(!pending)onClose();}} className={styles.panel} actions={<TaskActions className={styles.actions}><FanAction disabled={pending} onClick={onClose}>{t.cancel}</FanAction><FanAction variant='primary' disabled={pending} onClick={()=>onSave(draft)}>{failed?c.retrySave:c.save}</FanAction></TaskActions>}><div className={styles.body}><label className={styles.page}><span>{c.page}</span><select value='current' aria-label={c.page} onChange={()=>{}}><option value='current'>{pageName}</option></select></label><div role='status' aria-live='polite' aria-atomic='true' className={styles.saved}>{saved&&!pending&&!failed?c.saved:null}</div>{failed&&<p role='alert'>{c.saveFailed}</p>}{groupNotificationKeys.map(key=><label className={styles.choice} key={key}><span className={styles.label}>{c[key]}</span><span className={styles.control}><input type='checkbox' checked={draft[key]} disabled={pending} onChange={e=>{setDraft(value=>({...value,[key]:e.target.checked}));onChange?.();}}/></span></label>)}</div></TaskPanel>;
}
