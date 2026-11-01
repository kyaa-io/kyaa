"use client";
import {Info,CalendarCheck,Coins,ArrowRight} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {groupEventsSchema} from '@/server/group-activities/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {useGroupResource} from './use-group-resource';
import {GroupImage} from './group-image';
import {groupsCopy} from './copy';
import {groupHomeCopy} from './home-copy';
import {type GroupPage} from '../domain/contracts';
import {z} from 'zod';
import styles from './groups.module.css';
const parseEvents=(v:unknown)=>groupEventsSchema.parse(v),parsePresence=(v:unknown)=>z.object({onlineCount:z.number(),todayCount:z.number()}).parse(v);
export function GroupHomeInfo({page,locale}:{page:GroupPage;locale:AppLocale}){const t=groupsCopy(locale),c=groupHomeCopy(locale),w=walletCopy(locale),r=useGroupResource(`/api/groups/${page.id}/presence`,parsePresence);return <aside className={styles.homeInfo}><section><h2><Info size={20} aria-hidden='true'/>{t.info}</h2><p>{page.description}</p><dl>{[[t.members,page.memberCount],[c.online,r.data?.onlineCount],[c.today,r.data?.todayCount]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{typeof value==='number'?value.toLocaleString(locale):'—'}</dd></div>)}</dl>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</section><section><h2><CalendarCheck size={20} aria-hidden='true'/>{c.activity}</h2><FanAction href={`/my/wallet?locale=${locale}&view=attendance`} variant='text' leadingIcon={<CalendarCheck/>} trailingIcon={<ArrowRight/>}>{w.attendance}</FanAction><FanAction href={`/my/wallet?locale=${locale}`} variant='text' leadingIcon={<Coins/>} trailingIcon={<ArrowRight/>}>{w.wallet}</FanAction></section></aside>;}
export function GroupBrandHomeEvent({pageId,locale}:{pageId:string;locale:AppLocale}){const t=groupsCopy(locale),c=groupHomeCopy(locale),r=useGroupResource(`/api/groups/${pageId}/events`,parseEvents),event=r.data?.events[0];if(!event)return r.error?<section role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></section>:r.loading?<p role='status'>{t.loading}</p>:null;return <section className={styles.brandEvent}><h2>{t.events}</h2><article>{event.imageUrl&&<GroupImage locale={locale} src={event.imageUrl} alt=''/>}<div><h3>{event.title}</h3><p>{event.description}</p><FanAction href={`/pages/groups/${pageId}/events/${event.id}?locale=${locale}`} trailingIcon={<ArrowRight/>}>{c.eventDetails}</FanAction></div></article></section>;}
