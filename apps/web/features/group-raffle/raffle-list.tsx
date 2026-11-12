"use client";
import type { ReactNode } from 'react';
import { FanSkeletonRows } from '@/components/fan-ui/fan-skeleton';
import eventListStyles from '@/features/groups/ui/group-event-list.module.css';
import { GroupImage } from "@/features/groups/ui/group-image";
import Link from "../../components/fan-ui/hover-prefetch-link";
import type { Route } from 'next';
import { z } from 'zod';
import { FanAction } from '@/components/fan-ui/fan-action';
import { useGroupResource } from '@/features/groups/ui/use-group-resource';
import { groupsCopy } from '@/features/groups/ui/copy';
import type { AppLocale } from '@/i18n/locales';
import { groupRaffleSchema } from './domain';
import { raffleCopy } from './copy';
import { groupHomeCopy } from "@/features/groups/ui/home-copy";
import styles from '@/features/groups/ui/groups.module.css';
const parse=(v:unknown)=>z.object({raffles:z.array(groupRaffleSchema)}).parse(v);
export function GroupRaffleList({pageId,locale,preview=false,action,emptyLabel}:{pageId:string;locale:AppLocale;preview?:boolean;action?:ReactNode;emptyLabel?:string}){
 const t=groupsCopy(locale),c=raffleCopy(locale),r=useGroupResource(`/api/groups/${pageId}/raffles`,parse);
 const rows=preview?r.data?.raffles.filter(item=>item.status==='open'):r.data?.raffles;if(preview&&r.data&&!rows?.length)return null;
 return <section className={preview?styles.homeRaffle:styles.panel}>{action?<div className={eventListStyles.head}><h2>{c.title}</h2><span className={eventListStyles.headAction}>{action}</span></div>:<h2>{preview?groupHomeCopy(locale).raffles:c.title}</h2>}{r.error?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:r.loading?<FanSkeletonRows rows={3} variant='entity' ariaLabel={t.loading}/>:!rows?.length?<p>{emptyLabel??t.empty}</p>:rows.map(raffle=><Link className={styles.card} key={raffle.id} href={`/pages/groups/${pageId}/raffles/${raffle.id}?locale=${locale}` as Route}>{raffle.imageUrl&&<GroupImage locale={locale} src={raffle.imageUrl} width={64} height={64} alt='' style={{width:64,height:64,objectFit:'contain',borderRadius:12}}/>}<span className={styles.cardCopy}><strong>{raffle.title}</strong>{raffle.summary&&<span className={styles.meta}>{raffle.summary}</span>}<time className={styles.meta} dateTime={raffle.entryClosesAt??undefined}>{raffle.entryClosesAt?new Date(raffle.entryClosesAt).toLocaleString(locale):'—'}</time></span>{preview&&<span className={styles.chip}>{c.enter}</span>}</Link>)}</section>;
}
