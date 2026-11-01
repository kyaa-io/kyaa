"use client";
import { GroupImage } from "./group-image";
import Link from 'next/link';
import { useState } from 'react';
import type { Route } from 'next';
import { CalendarDays, ListChecks, ShoppingBag } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import { groupActivitiesSchema, groupEventsSchema, groupCollectionsSchema, groupMissionsSchema } from '@/server/group-activities/domain';
import { GroupRaffleList } from '@/features/group-raffle/raffle-list';
import type { AppLocale } from '@/i18n/locales';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { activitiesCopy } from './activities-copy';
import styles from './groups.module.css';
import { GroupCollectionEditor } from './group-activity-editors';
import { capsuleCopy } from '@/features/group-capsule/copy';
import { managementCopy } from './management-copy';
const parseMissions=(v:unknown)=>groupMissionsSchema.parse(v);
const parseActivities=(v:unknown)=>groupActivitiesSchema.parse(v),parseEvents=(v:unknown)=>groupEventsSchema.parse(v),parseCollections=(v:unknown)=>groupCollectionsSchema.parse(v);
export function GroupActivitiesPanel({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/${pageId}/activities`,parseActivities);
 if(!r.data)return <section className={styles.status}><p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</section>;
 return <div className={styles.form}>{r.data.certificationHref&&<FanAction href={`${r.data.certificationHref}${r.data.certificationHref.includes('?')?'&':'?'}locale=${locale}`} leadingIcon={<ListChecks/>}>{t.fan}</FanAction>}<GroupMissionsList pageId={pageId} locale={locale}/><GroupEventsList pageId={pageId} locale={locale}/><GroupRaffleList pageId={pageId} locale={locale}/><FanAction href={`/my/capsules?locale=${locale}&pageId=${pageId}`}>{capsuleCopy(locale).title}</FanAction></div>;
}
export function GroupEventsList({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=groupsCopy(locale),r=usePaged(`/api/groups/${pageId}/events`,parseEvents,eventItems);
 return <section className={styles.panel}><h2>{t.events}</h2>{r.error?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:r.loading?<p role='status'>{t.loading}</p>:r.items.length?r.items.map(item=><Link key={item.id} className={styles.card} href={`/pages/groups/${pageId}/events/${item.id}?locale=${locale}` as Route}>{item.imageUrl?<GroupImage locale={locale} src={item.imageUrl} className={styles.avatar} width={48} height={48} alt=''/>:<CalendarDays aria-hidden='true'/>}<span className={styles.cardCopy}><strong>{item.title}</strong><time className={styles.meta} dateTime={item.startsAt}>{new Date(item.startsAt).toLocaleString(locale)}</time><span className={styles.meta}>{item.location}</span></span></Link>):<p>{t.empty}</p>}{r.data?.nextCursor&&<FanAction onClick={r.more}>{t.more}</FanAction>}</section>;
}
export function GroupCollections({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=groupsCopy(locale),c=activitiesCopy(locale),m=managementCopy(locale),r=usePaged(`/api/groups/${pageId}/collections`,parseCollections,collectionItems),[editing,setEditing]=useState<string>();
 return <section className={styles.panel}><h2>{t.collection}</h2>{r.error?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:r.loading?<p role='status'>{t.loading}</p>:r.items.length?<div className={styles.grid}>{r.items.map(item=><article className={styles.panel} key={item.id}>{item.imageUrl?<GroupImage locale={locale} src={item.imageUrl} alt='' style={{width:'100%',height:'auto',maxHeight:240,objectFit:'contain'}}/>:<ShoppingBag aria-hidden='true'/>}<strong>{item.title}</strong>{r.data?.canManage&&<FanAction onClick={()=>setEditing(editing===item.id?undefined:item.id)}>{m.manage}</FanAction>}{editing===item.id?<GroupCollectionEditor pageId={pageId} locale={locale} initial={item} done={()=>{setEditing(undefined);r.retry();}}/>:item.status==='active'?<FanAction href={item.externalUrl} external>{c.buy}</FanAction>:<span className={styles.meta}>{item.status==='sold_out'?c.soldOut:c.hidden}</span>}</article>)}</div>:<p>{t.empty}</p>}{r.data?.nextCursor&&<FanAction onClick={r.more}>{t.more}</FanAction>}</section>;
}

const eventItems=(v:ReturnType<typeof parseEvents>)=>v.events;
const collectionItems=(v:ReturnType<typeof parseCollections>)=>v.items;
const missionItems=(v:ReturnType<typeof parseMissions>)=>v.missions;
function usePaged<T extends {nextCursor:string|null},I extends {id:string}>(base:string,parse:(v:unknown)=>T,items:(v:T)=>I[]){
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{key:string;items:I[]}>({key:'',items:[]}),r=useGroupResource(`${base}${cursor?`?cursor=${cursor}`:''}`,parse),key=`${r.ownerKey}:${base}`;
 const rows=[...(previous.key===key?previous.items:[]),...(r.data?items(r.data):[])];
 return {...r,retry:()=>{setPrevious({key:'',items:[]});setCursor(undefined);r.retry();},items:rows.filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i),more:()=>{if(r.data?.nextCursor){setPrevious({key,items:rows});setCursor(r.data.nextCursor);}}};
}
function GroupMissionsList({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=groupsCopy(locale),c=activitiesCopy(locale),r=usePaged(`/api/groups/${pageId}/missions`,parseMissions,missionItems);
 return <section className={styles.panel}><h2>{c.missions}</h2>{r.error?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:r.loading?<p role='status'>{t.loading}</p>:r.items.length?r.items.map(item=><Link key={item.id} className={styles.card} href={`${item.actionHref}?locale=${locale}` as Route}>{item.imageUrl?<GroupImage locale={locale} className={styles.avatar} width={48} height={48} src={item.imageUrl} alt=''/>:<ListChecks aria-hidden='true'/>}<span className={styles.cardCopy}><strong>{item.title}</strong><span className={styles.meta}>{item.rewardPoints.toLocaleString(locale)} P · {item.status==='available'?t.activities:c[item.status]}</span></span></Link>):<p>{t.empty}</p>}{r.data?.nextCursor&&<FanAction onClick={r.more}>{t.more}</FanAction>}</section>;
}
