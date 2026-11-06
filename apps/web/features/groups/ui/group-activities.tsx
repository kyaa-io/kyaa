"use client";
import {eventApprovalCopy,isEventOpen} from '@/features/group-event-approval/event-approval-status';
import {SourceStatePanel} from "./source-state-panel";
import { GroupImage } from "./group-image";
import Link from 'next/link';
import { useState } from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {activityHubCopy} from './activity-hub-copy';
import {interactionCopy} from './interaction-copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import type { Route } from 'next';
import { CalendarDays, ListChecks, ShoppingBag, Check, ExternalLink, BadgeCheck, Ticket, ArrowLeft, ArrowRight } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import { groupActivitiesSchema, groupEventsSchema, groupCollectionsSchema, groupMissionsSchema } from '@/server/group-activities/domain';
import { GroupRaffleList } from '@/features/group-raffle/raffle-list';
import type { AppLocale } from '@/i18n/locales';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { activitiesCopy } from './activities-copy';
import styles from './groups.module.css';
import collectionStyles from './group-collections.module.css';
import {collectionPresentationCopy} from './collection-presentation-copy';
import { GroupCollectionEditor } from './group-activity-editors';
import { capsuleCopy } from '@/features/group-capsule/copy';
import { managementCopy } from './management-copy';
const parseMissions=(v:unknown)=>groupMissionsSchema.parse(v);
const parseActivities=(v:unknown)=>groupActivitiesSchema.parse(v),parseEvents=(v:unknown)=>groupEventsSchema.parse(v),parseCollections=(v:unknown)=>groupCollectionsSchema.parse(v);
export function GroupActivitiesPanel({pageId,locale,pageName}:{pageId:string;locale:AppLocale;pageName?:string}){
 const t=groupsCopy(locale),c=activitiesCopy(locale),descriptions=activityHubCopy(locale),pathname=usePathname(),search=useSearchParams(),r=useGroupResource(`/api/groups/${pageId}/activities`,parseActivities);
 const selected=search.get('activity'),section=['events','missions','raffles','collection'].includes(selected??'')?selected:null;
 const href=(value:string|null)=>{const query=new URLSearchParams(search.toString());query.set('locale',locale);if(value)query.set('activity',value);else query.delete('activity');return `${pathname}?${query}#group-activity-content` as Route;};
 if(!r.data)return <section className={styles.status}><p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</section>;
 if(section)return <section id="group-activity-content" className={styles.activityHub}><FanAction href={href(null)} variant="text" leadingIcon={<ArrowLeft/>}>{t.activities}</FanAction>{section==='events'?<GroupEventsList pageId={pageId} locale={locale}/>:section==='missions'?<GroupMissionsList pageId={pageId} locale={locale}/>:section==='collection'?<GroupCollections pageId={pageId} locale={locale} pageName={pageName}/>:<><GroupRaffleList pageId={pageId} locale={locale}/><FanAction href={`/my/capsules?locale=${locale}&pageId=${pageId}`} leadingIcon={<Ticket/>}>{capsuleCopy(locale).title}</FanAction></>}</section>;
 return <section id="group-activity-content" className={styles.activityHub}><h2>{t.activities}</h2><div className={styles.activityDestinations}>{r.data.certificationHref&&<Link className={styles.activityDestination} href={`${r.data.certificationHref}${r.data.certificationHref.includes('?')?'&':'?'}locale=${locale}` as Route}><h3><BadgeCheck aria-hidden="true"/>{interactionCopy(locale).verify}<ArrowRight className={styles.activityArrow} aria-hidden="true"/></h3><p>{descriptions[0]}</p></Link>}<Link className={styles.activityDestination} href={href('events')}><h3><CalendarDays aria-hidden="true"/>{locale==='ko'?'이벤트':t.events}<ArrowRight className={styles.activityArrow} aria-hidden="true"/></h3><p>{descriptions[1]}</p></Link><Link className={styles.activityDestination} href={href('missions')}><h3><ListChecks aria-hidden="true"/>{c.missions}<ArrowRight className={styles.activityArrow} aria-hidden="true"/></h3><p>{descriptions[2]}</p></Link><Link className={styles.activityDestination} href={href('raffles')}><h3><Ticket aria-hidden="true"/>{locale==='ko'?'추첨':raffleCopy(locale).title}<ArrowRight className={styles.activityArrow} aria-hidden="true"/></h3><p>{descriptions[3]}</p></Link></div><FanAction className={styles.activityCollection} leadingIcon={<ShoppingBag/>} href={href('collection')} trailingIcon={<ArrowRight/>}>{t.collection}</FanAction></section>;
}
export function GroupEventsList({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=groupsCopy(locale),r=usePaged(`/api/groups/${pageId}/events`,parseEvents,eventItems);
 return <section className={styles.panel}><h2>{t.events}</h2>{r.error?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:r.loading?<p role='status'>{t.loading}</p>:r.items.length?r.items.map(item=><Link key={item.id} className={styles.card} href={`/pages/groups/${pageId}/events/${item.id}?locale=${locale}` as Route}>{item.imageUrl?<GroupImage locale={locale} src={item.imageUrl} className={styles.avatar} width={48} height={48} alt=''/>:<CalendarDays aria-hidden='true'/>}<span className={styles.cardCopy}><strong>{item.title}</strong><time className={styles.meta} dateTime={item.startsAt}>{new Date(item.startsAt).toLocaleString(locale)}</time><span className={styles.meta}>{item.location}</span>{item.state==='draft'&&<span className={styles.meta}>{activitiesCopy(locale).draft}</span>}{item.state==='published'&&!isEventOpen(item)&&<span className={styles.meta}>{eventApprovalCopy[locale][item.approvalStatus==='rejected'?'rejected':'pending']}</span>}{item.approvalStatus==='rejected'&&item.approvalReason&&<span className={styles.meta}>{item.approvalReason}</span>}</span></Link>):<p>{t.empty}</p>}{r.data?.nextCursor&&<FanAction onClick={r.more}>{t.more}</FanAction>}</section>;
}
export type GroupCollectionCategory={id:string;label:string;itemIds:readonly string[]};
export function GroupCollections({pageId,locale,pageName,heading,description,productHeading,initialItemId,sellerLabel,categories}:{pageId:string;locale:AppLocale;pageName?:string;heading?:string;description?:string;productHeading?:string;initialItemId?:string;sellerLabel?:string;categories?:readonly GroupCollectionCategory[]}){
 const labels=collectionPresentationCopy(locale),t=groupsCopy(locale),c=activitiesCopy(locale),m=managementCopy(locale),r=usePaged(`/api/groups/${pageId}/collections`,parseCollections,collectionItems),[editing,setEditing]=useState<string>(),[selectedId,setSelectedId]=useState(initialItemId),[categoryId,setCategoryId]=useState<string>();
 const category=categories?.find(item=>item.id===categoryId)??categories?.[0],items=category?r.items.filter(item=>category.itemIds.includes(item.id)):r.items;
 const selected=items.find(item=>item.id===selectedId)??items[0];
 return <section className={collectionStyles.panel} data-group-collections><header className={collectionStyles.heading}><h2>{heading??(pageName?labels.heading.replace('{name}',()=>pageName):t.collection)}</h2>{(description??labels.description)&&<p>{description??labels.description}</p>}</header>{Boolean(categories?.length)&&<div className={collectionStyles.categories}>{categories?.map(item=><button type="button" key={item.id} disabled={Boolean(editing)} aria-pressed={item.id===category?.id} onClick={()=>setCategoryId(item.id)}>{item.label}</button>)}</div>}{r.error?<SourceStatePanel fill title={locale==='ko'?'상품 정보를 불러오지 못했어요':t.error} description={t.error} role='alert' actions={[{label:t.retry,onClick:r.retry,variant:'primary'}]}/>:r.loading?<p role='status'>{t.loading}</p>:selected?<><div className={collectionStyles.product}><div className={collectionStyles.image}>{selected.imageUrl?<GroupImage key={selected.id} locale={locale} src={selected.imageUrl} alt={selected.title}/>:<ShoppingBag size={64} aria-hidden='true'/>}</div><div className={collectionStyles.details}>{productHeading&&<p className={collectionStyles.productHeading}>{productHeading}</p>}<h3>{selected.title}</h3><p className={collectionStyles.seller}>{sellerLabel??new URL(selected.externalUrl).hostname}</p><div className={collectionStyles.type}><span>{labels.type}</span><div className={collectionStyles.selectors} aria-label={t.collection}>{items.map(item=><button type='button' key={item.id} aria-pressed={item.id===selected.id} disabled={Boolean(editing)} onClick={()=>setSelectedId(item.id)}>{item.title}{item.id===selected.id&&<Check size={16} aria-hidden/>}</button>)}</div></div>{selected.status==='active'?<FanAction className={collectionStyles.buy} href={selected.externalUrl} external trailingIcon={<ExternalLink size={18} aria-hidden/>} variant='primary'>{labels.seller}</FanAction>:selected.status==='sold_out'?<SourceStatePanel fill sourceId='f1AE6v' title={locale==='ko'?'판매가 종료된 상품이에요':c.soldOut} actions={[{label:locale==='ko'?'다른 상품 둘러보기':t.collection,onClick:()=>{const next=items.find(item=>item.id!==selected.id&&item.status==='active');if(next)setSelectedId(next.id);},disabled:!items.some(item=>item.id!==selected.id&&item.status==='active'),variant:'primary'}]}/>:<span className={collectionStyles.status}>{c.hidden}</span>}<p className={collectionStyles.notice}>{labels.notice}</p>{r.data?.canManage&&<FanAction onClick={()=>setEditing(editing===selected.id?undefined:selected.id)}>{m.manage}</FanAction>}</div></div>{editing===selected.id&&<GroupCollectionEditor pageId={pageId} locale={locale} initial={selected} done={()=>{setEditing(undefined);r.retry();}}/>}</>:<p>{t.empty}</p>}{r.data?.nextCursor&&<FanAction onClick={r.more}>{t.more}</FanAction>}</section>;
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
