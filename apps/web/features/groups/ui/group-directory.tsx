"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Search } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { groupApiQuery, groupHref, groupListSchema, type GroupList } from "../domain/contracts";
import { useGroupResource } from "./use-group-resource";
import { groupsCopy } from "./copy";
import { GroupAvatar, GroupShell } from "./group-shell";
import { discoveryCopy } from "./discovery-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import styles from "./groups.module.css";
const parseList = (value:unknown)=>groupListSchema.parse(value);
export function GroupDirectory({locale,initialOwned=false}:{locale:AppLocale;initialMine?:"joined"|"bookmarked";initialType?:"all"|"fan"|"hobby"|"brand";initialSearch?:string;initialSort?:"popular"|"recent";initialOwned?:boolean}) {
  const t=groupsCopy(locale),c=discoveryCopy(locale),w=walletCopy(locale);
  const query=useSearchParams();
  const type=query.get("type")??"all",search=query.get("search")??"",sort=query.get("sort")??"popular",mine=query.get("mine")??undefined;
  const [draftState,setDraftState]=useState({search,value:search});
  const draft=draftState.search===search?draftState.value:search;
  const setDraft=(value:string)=>setDraftState({search,value});
  const updateQuery=(key:string,value:string|undefined)=>{const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);};
  const setType=(value:string)=>updateQuery('type',value),setSearch=(value:string)=>updateQuery('search',value),setSort=(value:string)=>updateQuery('sort',value),setMine=(value:string|undefined)=>updateQuery('mine',value);
  const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{ownerKey:string;items:GroupList["items"]}>({ownerKey:"",items:[]});
  const resource=useGroupResource(groupApiQuery({type,search,sort,mine,cursor,owned:initialOwned?"1":undefined}),parseList);
  const joined=useGroupResource(resource.ready&&resource.authenticated?groupApiQuery({mine:"joined"}):null,parseList);
  const reset=()=>{setCursor(undefined);setPrevious({ownerKey:"",items:[]});};
  const submit=(event:FormEvent)=>{event.preventDefault();reset();setSearch(draft.trim());};
  const items=[...(previous.ownerKey===resource.ownerKey?previous.items:[]),...(resource.data?.items??[])];
  return <GroupShell locale={locale}>
    <header className={styles.discoveryIntro}><h1>{c.title}</h1><p>{c.intro}</p></header>
    <section className={styles.discoveryHero} aria-labelledby="running-discovery-title"><div><h2 id="running-discovery-title">{c.heroTitle}</h2><p>{c.heroBody}</p><FanAction href={`/pages/groups?locale=${locale}&type=hobby&search=${encodeURIComponent('러닝')}`} variant="primary" trailingIcon={<ArrowRight/>}>{c.heroAction}</FanAction></div><img src="/images/groups/running-event.png" alt=""/></section>
    <div className={`${styles.layout} ${styles.discoveryLayout}`}><section className={styles.main} aria-label={t.explore}>
      <div className={styles.discoveryHeading}><h2>{t.explore}</h2>{resource.data&&!resource.loading&&!resource.error&&<output aria-live="polite" className={styles.meta}>{t.all} {items.length.toLocaleString(locale)}{resource.data.nextCursor?'+':''}</output>}</div>
      <div className={styles.discoveryControls}><div className={styles.filters} aria-label={t.groups}>{(["all","fan","hobby","brand"] as const).map(value=><button className={styles.chip} aria-pressed={type===value} key={value} onClick={()=>{reset();setType(value);}}>{t[value]}</button>)}</div>
      <form className={styles.search} onSubmit={submit}><input className={styles.input} aria-label={t.searchPlaceholder} placeholder={t.searchPlaceholder} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={100}/><button className={styles.searchIcon} aria-label={t.search}><Search size={18}/></button></form>
      <select className={styles.select} aria-label={t.popular} value={sort} onChange={e=>{reset();setSort(e.target.value);}}><option value="recent">{c.defaultSort}</option><option value="popular">{type==='fan'?t.popular:c.membersSort}</option></select></div>
      {(mine||initialOwned)&&<div className={styles.toolbar}><button className={styles.chip} aria-pressed={mine==="joined"} onClick={()=>{reset();setMine(mine==="joined"?undefined:"joined");}}>{t.joinedPages}</button><button className={styles.chip} aria-pressed={mine==="bookmarked"} onClick={()=>{reset();setMine(mine==="bookmarked"?undefined:"bookmarked");}}>{t.bookmark}</button></div>}
      {resource.error?<div className={styles.status} role="alert"><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>:resource.loading?<p className={styles.status} role="status">{t.loading}</p>:items.length?<div className={`${styles.grid} ${styles.directoryGrid}`}>{items.map(page=><Link className={`${styles.card} ${styles.directoryCard}`} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><span className={styles.cardCopy}><strong>{page.name}</strong><span className={styles.meta}>{t[page.kind]} · {page.memberCount.toLocaleString(locale)}</span><span className={styles.meta}>{page.description}</span></span><ArrowRight className={styles.arrow} aria-hidden="true"/></Link>)}</div>:<p className={styles.status}>{t.empty}</p>}
      {resource.data?.nextCursor&&<FanAction className={styles.more} fullWidth onClick={()=>{setPrevious({ownerKey:resource.ownerKey,items});setCursor(resource.data?.nextCursor??undefined);}} trailingIcon={<ArrowRight/>}>{t.more}</FanAction>}
    </section><aside className={styles.discoveryAside}><section><h2>{t.myPages}</h2>{resource.authenticated?joined.loading?<p role="status">{t.loading}</p>:joined.error?<FanAction onClick={joined.retry}>{t.retry}</FanAction>:!joined.data?.items.length?<p>{t.empty}</p>:joined.data.items.slice(0,3).map(page=><Link className={styles.joinedRow} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><strong>{page.name}</strong></Link>):<FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups?locale=${locale}`)}`}>{t.login}</FanAction>}
      {resource.authenticated&&<FanAction href={`/pages/groups?locale=${locale}&mine=joined`} variant="text" trailingIcon={<ArrowRight/>}>{t.joinedPages} · {joined.data?.items.length??'—'}{joined.data?.nextCursor?'+':''}</FanAction>}</section>
      <section className={styles.discoveryAttendance}><div><h3>{c.attendance}</h3><p>{c.attendanceBody}</p></div><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} variant="primary">{w.attendance}</FanAction></section>
      <section><h3>{c.fanTitle}</h3><p>{c.fanBody}</p><FanAction href={`/pages/groups/apply?locale=${locale}&kind=fan`} variant="text" trailingIcon={<ArrowRight/>}>{t.apply}</FanAction></section>
      <section><h3>{c.otherTitle}</h3><p>{c.otherBody}</p><FanAction href={`/pages/groups/apply?locale=${locale}`} variant="text" trailingIcon={<ArrowRight/>}>{t.apply}</FanAction></section>
    </aside></div>
  </GroupShell>;
}
