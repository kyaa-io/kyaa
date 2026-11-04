"use client";
import { useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { groupOperatorStatsSchema } from "../domain/operator-stats";
import { operatorCopy } from "./group-operator-copy";
import { useGroupResource } from "./use-group-resource";
import styles from "./group-operator-stats.module.css";
const parse=(value:unknown)=>groupOperatorStatsSchema.parse(value);
export function GroupOperatorStats({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=operatorCopy(locale),[days,setDays]=useState<7|30>(7),r=useGroupResource(`/api/groups/${pageId}/stats?days=${days}`,parse),nf=new Intl.NumberFormat(locale);
 const d=r.data,max=d?Math.max(1,...d.daily.map(x=>x.visitors)):1;
 const cards:[string,number][]=d?[[t.members,d.members],[t.joined,d.joinedInPeriod],[t.posts,d.posts],[t.postsPeriod,d.postsInPeriod],[t.notices,d.notices],[t.visitors,d.visitors],[t.visitDays,d.visitDays]]:[];
 return <section id="stats" className={styles.section}>
  <div className={styles.head}><h2>{t.statsTitle}</h2><div className={styles.toggle}>{([7,30] as const).map(n=><button key={n} type="button" aria-pressed={days===n} onClick={()=>setDays(n)}>{n===7?t.days7:t.days30}</button>)}</div></div>
  {r.error?<div className={styles.status}><p role="alert" className={styles.error}>{t.error}</p><button type="button" className={styles.btn} onClick={r.retry}>{t.retry}</button></div>:!d?<p className={styles.status} role="status">{t.loading}</p>:<>
   <ul className={styles.cards}>{cards.map(([label,value])=><li key={label}><span>{label}</span><strong>{nf.format(value)}</strong></li>)}</ul>
   <div className={styles.daily}><h3>{t.daily}</h3>
    <ul className={styles.bars}>{d.daily.map(x=><li key={x.day} title={`${x.day} · ${nf.format(x.visitors)}`}><i style={{height:`${Math.round(x.visitors/max*100)}%`}} aria-label={`${x.day} ${nf.format(x.visitors)}`}/></li>)}</ul>
    <div className={styles.axis}><span>{d.from}</span><span>{d.to}</span></div>
   </div></>}
 </section>;
}
