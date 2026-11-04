"use client";
import { Footprints, Radio, UsersRound } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { useGroupPresence } from './use-group-presence';
import { groupsCopy } from './copy';
import { presenceCopy, presenceUnavailableCopy } from './presence-copy';
import { groupHomeCopy } from "./home-copy";
import styles from './groups.module.css';
import presenceStyles from './group-presence.module.css';
export function GroupPresence({pageId,locale,member=false,mode="summary"}:{pageId:string;locale:AppLocale;member?:boolean;mode?:"summary"|"hidden"|"compact"}){
 const r=useGroupPresence(pageId,true,member),t=groupsCopy(locale),c=presenceCopy(locale);
 if(mode==='hidden')return null;
 if(!r.data)return r.error?<div role='status'><p className={styles.meta}>{presenceUnavailableCopy[locale]}</p><button type='button' className={styles.chip} onClick={r.retry}>{t.retry}</button></div>:<p role='status' className={styles.meta}>{t.loading}</p>;
 if(mode==='compact'){const short=groupHomeCopy(locale),seen=r.data.artists.filter(artist=>artist.online||artist.visitedToday),live=seen.some(artist=>artist.online)?seen.filter(artist=>artist.online):seen;return <section className={styles.creatorPresence} aria-label={t.groups}><div className={styles.creatorPresenceMobile}><UsersRound size={18} aria-hidden='true'/><strong>{short.online} {r.data.onlineCount.toLocaleString(locale)} · {short.today} {r.data.todayCount.toLocaleString(locale)}</strong></div><div className={styles.creatorPresenceMetric}><UsersRound size={24} aria-hidden='true'/><span><strong>{r.data.onlineCount.toLocaleString(locale)}</strong><span>{c.online}</span></span></div><div className={styles.creatorPresenceMetric}><Footprints size={24} aria-hidden='true'/><span><strong>{r.data.todayCount.toLocaleString(locale)}</strong><span>{c.today}</span></span></div>{live.length>0&&<div className={presenceStyles.artistCell} data-online={live.some(artist=>artist.online)}><Radio size={24} aria-hidden='true'/><span><strong className={presenceStyles.artistName}>{live.map(artist=>artist.nickname).join(', ')}</strong><span className={presenceStyles.artistState}>{live.some(artist=>artist.online)?c.connected:c.visited}</span></span></div>}</section>;}
 return <section className={styles.presence} aria-label={t.groups}><div><UsersRound aria-hidden='true' size={20}/><span><strong>{r.data.onlineCount.toLocaleString(locale)}</strong><span className={styles.meta}>{c.online}</span></span></div><div><Footprints aria-hidden='true' size={20}/><span><strong>{r.data.todayCount.toLocaleString(locale)}</strong><span className={styles.meta}>{c.today}</span></span></div>{r.data.artists.map(artist=><div key={artist.profileId}><Radio aria-hidden='true' size={20}/><span><strong>{artist.nickname}</strong><span className={styles.meta}>{artist.online?c.connected:artist.visitedToday?c.visited:''}</span></span></div>)}</section>;
}
