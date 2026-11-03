"use client";
import { useEffect } from 'react';
import { z } from 'zod';
import { Footprints, Radio, UsersRound } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { FanAction } from '@/components/fan-ui/fan-action';
import { GroupRequestError, useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { presenceCopy } from './presence-copy';
import { groupHomeCopy } from "./home-copy";
import styles from './groups.module.css';
const parse=(v:unknown)=>z.object({onlineCount:z.number().int().nonnegative(),todayCount:z.number().int().nonnegative(),artists:z.array(z.object({profileId:z.uuid(),nickname:z.string(),online:z.boolean(),visitedToday:z.boolean()}))}).parse(v);
export function GroupPresence({pageId,locale,member=false,mode="summary"}:{pageId:string;locale:AppLocale;member?:boolean;mode?:"summary"|"hidden"|"compact"}){
 const url=`/api/groups/${pageId}/presence`,r=useGroupResource(url,parse),{retry,request,authenticated,ready}=r,t=groupsCopy(locale),c=presenceCopy(locale);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')retry();},20000);return()=>clearInterval(timer);},[retry]);
 useEffect(()=>{
  if(!ready||!authenticated)return;let active=true,blocked=false,pending=false;const controller=new AbortController();
  const beat=async()=>{if(!active||blocked||pending||document.visibilityState==='hidden')return;pending=true;try{await request(url,{method:'PUT',signal:controller.signal});if(active)retry();}catch(error){if(error instanceof GroupRequestError&&[401,403,404].includes(error.status))blocked=true;}finally{pending=false;}};
  void beat();const timer=setInterval(()=>void beat(),30000);return()=>{active=false;controller.abort();clearInterval(timer);};
 },[ready,authenticated,request,retry,url,member]);
 if(mode==='hidden')return null;
 if(!r.data)return r.error?<div className={styles.status} role='alert'><p>{t.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>:<p role='status' className={styles.meta}>{t.loading}</p>;
 if(mode==='compact'){const short=groupHomeCopy(locale);return <section className={styles.creatorPresence} aria-label={t.groups}><div className={styles.creatorPresenceMobile}><UsersRound size={18} aria-hidden='true'/><strong>{short.online} {r.data.onlineCount.toLocaleString(locale)} · {short.today} {r.data.todayCount.toLocaleString(locale)}</strong></div><div className={styles.creatorPresenceMetric}><UsersRound size={24} aria-hidden='true'/><span><strong>{r.data.onlineCount.toLocaleString(locale)}</strong><span>{c.online}</span></span></div><div className={styles.creatorPresenceMetric}><Footprints size={24} aria-hidden='true'/><span><strong>{r.data.todayCount.toLocaleString(locale)}</strong><span>{c.today}</span></span></div>{r.data.artists.map(artist=><div key={artist.profileId} data-online={artist.online}><Radio size={18} aria-hidden='true'/><span><strong>{artist.nickname}</strong><span>{artist.online?c.connected:artist.visitedToday?c.visited:''}</span></span></div>)}</section>;}
 return <section className={styles.presence} aria-label={t.groups}><div><UsersRound aria-hidden='true' size={20}/><span><strong>{r.data.onlineCount.toLocaleString(locale)}</strong><span className={styles.meta}>{c.online}</span></span></div><div><Footprints aria-hidden='true' size={20}/><span><strong>{r.data.todayCount.toLocaleString(locale)}</strong><span className={styles.meta}>{c.today}</span></span></div>{r.data.artists.map(artist=><div key={artist.profileId}><Radio aria-hidden='true' size={20}/><span><strong>{artist.nickname}</strong><span className={styles.meta}>{artist.online?c.connected:artist.visitedToday?c.visited:''}</span></span></div>)}</section>;
}
