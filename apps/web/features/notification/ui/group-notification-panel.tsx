'use client';
import Link from "../../../components/fan-ui/hover-prefetch-link";
import {ChevronRight} from 'lucide-react';
import type {Route} from 'next';
import type {ReactNode} from 'react';
import type {AppLocale} from '@/i18n/locales';
import {TranslatedText} from '@/features/content-safety/ui/use-automatic-translation';
import styles from './group-notification-panel.module.css';
/** 한 줄 = 한 링크: 제목, 그 아래 할 일 · 시각. */
export type GroupNotificationRow={id:string;label:string;actionLabel:string;href:string;meta?:string;unread?:boolean;tag?:ReactNode};
const copy:Record<AppLocale,string>={ko:'알림',en:'Notifications',ja:'通知','zh-Hans':'通知','zh-Hant':'通知',es:'Notificaciones',id:'Notifikasi',vi:'Thông báo',th:'การแจ้งเตือน',pt:'Notificações',fr:'Notifications',ru:'Уведомления'};
export function GroupNotificationPanel({locale,rows,onOpen,emptyLabel}:{locale:AppLocale;rows:readonly GroupNotificationRow[];onOpen?:(id:string)=>void;emptyLabel?:string}){
 const t=copy[locale];
 return <section className={styles.panel} aria-labelledby='group-notification-title'><h1 id='group-notification-title'>{t}</h1><ul>{rows.map(row=><li key={row.id}><Link href={row.href as Route} data-unread={row.unread||undefined} onClick={event=>{if(!onOpen||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpen(row.id);}}><span className={styles.copy}><strong>{row.tag?<span className={styles.tag}>{row.tag}</span>:null}<TranslatedText text={row.label} locale={locale} controls={false}/></strong><span><TranslatedText text={row.actionLabel} locale={locale} controls={false}/>{row.meta?<> · <time>{row.meta}</time></>:null}</span></span><ChevronRight aria-hidden='true' size={16}/></Link></li>)}</ul>{!rows.length&&emptyLabel&&<p role='status'>{emptyLabel}</p>}</section>;
}
