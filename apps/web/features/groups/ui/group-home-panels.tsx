"use client";
import {useRef,useState} from 'react';
import {WalletAttendanceDialog} from '@/features/group-wallet/ui/wallet-screen';
import {Info,CalendarCheck,Coins,ArrowRight} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {groupEventsSchema} from '@/server/group-activities/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {useGroupResource} from './use-group-resource';
import {GroupImage} from './group-image';
import {groupsCopy} from './copy';
import {groupHomeCopy} from './home-copy';
import {activityCardCopy} from './activity-card-copy';
import {type GroupPage} from '../domain/contracts';
import {useGroupPresence} from './use-group-presence';
import {presenceCopy} from './presence-copy';
import styles from './groups.module.css';
const parseEvents=(v:unknown)=>groupEventsSchema.parse(v);
export function GroupHomeInfo({page,locale}:{page:GroupPage;locale:AppLocale}){const t=groupsCopy(locale),c=groupHomeCopy(locale),ac=activityCardCopy[locale],w=walletCopy(locale),r=useGroupPresence(page.id,false),[attendanceOpen,setAttendanceOpen]=useState(false),attendanceTrigger=useRef<HTMLAnchorElement|null>(null);return <aside className={styles.homeInfo}><section className={styles.sourceHomeCard}><h2>{ac.title}</h2><p>{ac.body}</p><FanAction href={`/pages/groups/${page.id}/missions?locale=${locale}`}>{ac.check}</FanAction></section><section><h2><Info size={20} aria-hidden='true'/>{t.info}</h2><dl>{[[presenceCopy(locale).online,r.data?.onlineCount],[presenceCopy(locale).today,r.data?.todayCount]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{typeof value==='number'?value.toLocaleString(locale):'—'}</dd></div>)}</dl>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</section><section><h2><CalendarCheck size={20} aria-hidden='true'/>{c.activity}</h2><FanAction href={`/my/wallet?locale=${locale}&view=attendance`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} variant='text' leadingIcon={<CalendarCheck/>} trailingIcon={<ArrowRight/>}>{w.attendance}</FanAction><FanAction href={`/my/wallet?locale=${locale}`} variant='text' leadingIcon={<Coins/>} trailingIcon={<ArrowRight/>}>{w.wallet}</FanAction></section>{attendanceOpen&&<WalletAttendanceDialog locale={locale} open onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>}</aside>;}
export function GroupBrandHomeEvent({pageId,locale}:{pageId:string;locale:AppLocale}){const t=groupsCopy(locale),c=groupHomeCopy(locale),r=useGroupResource(`/api/groups/${pageId}/events`,parseEvents),event=r.data?.events[0];if(!event)return r.error?<section role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></section>:r.loading?<p role='status'>{t.loading}</p>:null;return <section className={styles.brandEvent}><h2>{t.events}</h2><article>{event.imageUrl&&<GroupImage locale={locale} src={event.imageUrl} alt=''/>}<div><h3>{event.title}</h3><p>{event.description}</p><FanAction href={`/pages/groups/${pageId}/events/${event.id}?locale=${locale}`} trailingIcon={<ArrowRight/>}>{c.eventDetails}</FanAction></div></article></section>;}
