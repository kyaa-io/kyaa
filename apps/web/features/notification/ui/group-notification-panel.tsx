'use client';
import Link from 'next/link';
import type {Route} from 'next';
import type {AppLocale} from '@/i18n/locales';
import {TranslatedText} from '@/features/content-safety/ui/use-automatic-translation';
import styles from './group-notification-panel.module.css';
export type GroupNotificationRow={id:string;label:string;actionLabel:string;href:string};
const copy:Record<AppLocale,string>={ko:'알림',en:'Notifications',ja:'通知','zh-Hans':'通知','zh-Hant':'通知',es:'Notificaciones',id:'Notifikasi',vi:'Thông báo',th:'การแจ้งเตือน',pt:'Notificações',fr:'Notifications',ru:'Уведомления'};
export function GroupNotificationPanel({locale,rows,onOpen,emptyLabel}:{locale:AppLocale;rows:readonly GroupNotificationRow[];onOpen?:(id:string)=>void;emptyLabel?:string}){
 const t=copy[locale];
 return <section className={styles.panel} aria-labelledby='group-notification-title'><h1 id='group-notification-title'>{t}</h1><ul>{rows.map(row=><li key={row.id}><span><TranslatedText text={row.label} locale={locale} controls={false}/></span><Link href={row.href as Route} onClick={event=>{if(!onOpen||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpen(row.id);}}><TranslatedText text={row.actionLabel} locale={locale} controls={false}/></Link></li>)}</ul>{!rows.length&&emptyLabel&&<p role='status'>{emptyLabel}</p>}</section>;
}
