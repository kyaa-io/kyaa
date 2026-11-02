"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {Menu} from "@base-ui/react/menu";
import sortStyles from "./group-directory-sort.module.css";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Search,ChevronDown,CircleAlert,SearchX,UsersRound } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { groupApiQuery, groupHref, groupListSchema, type GroupList } from "../domain/contracts";
import { useGroupResource } from "./use-group-resource";
import { groupsCopy } from "./copy";
import { GroupAvatar, GroupShell } from "./group-shell";
import { DiscoveryCarousel } from "./discovery-carousel";
import { creatorRoleFilterLabel } from "@/features/creator/domain/creator-role";
import { discoveryCopy } from "./discovery-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import styles from "./groups.module.css";
import {SourceStatePanel} from "./source-state-panel";
const parseList = (value:unknown)=>groupListSchema.parse(value);
const featuredTitle:Record<AppLocale,string>={ko:'지금 주목할 페이지',en:'Pages in the spotlight',ja:'今注目のページ','zh-Hans':'热门页面','zh-Hant':'熱門頁面',es:'Páginas destacadas',id:'Halaman pilihan',vi:'Trang nổi bật',th:'เพจที่น่าสนใจ',pt:'Páginas em destaque',fr:'Pages à découvrir',ru:'Популярные страницы'};
export function GroupDirectory({locale,initialOwned=false}:{locale:AppLocale;initialMine?:"joined"|"bookmarked";initialType?:"all"|"fan"|"hobby"|"brand";initialSearch?:string;initialSort?:"popular"|"recent";initialOwned?:boolean}) {
  const t=groupsCopy(locale),c=discoveryCopy(locale),w=walletCopy(locale);
  const query=useSearchParams();
  const type=query.get("type")??"all",search=query.get("search")??"",sort=query.get("sort")??"recent",mine=query.get("mine")??undefined,artistRole=query.get("artistRole")??undefined;
  const [draftState,setDraftState]=useState({search,value:search});
  const draft=draftState.search===search?draftState.value:search;
  const setDraft=(value:string)=>setDraftState({search,value});
  const updateQuery=(key:string,value:string|undefined)=>{const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);};
  const setType=(value:string)=>updateQuery('type',value),setSearch=(value:string)=>updateQuery('search',value),setSort=(value:string)=>updateQuery('sort',value),setMine=(value:string|undefined)=>updateQuery('mine',value);
  const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{ownerKey:string;items:GroupList["items"]}>({ownerKey:"",items:[]});
  const resource=useGroupResource(groupApiQuery({type,search,sort,mine,cursor,limit:'20',artistRole:type==='fan'?artistRole:undefined,owned:initialOwned?"1":undefined}),parseList);
  const featured=useGroupResource(type==='all'&&!search&&!mine&&!initialOwned?groupApiQuery({sort:'popular'}):null,parseList);
  const joined=useGroupResource(resource.ready&&resource.authenticated?groupApiQuery({mine:"joined"}):null,parseList);
  const reset=()=>{setCursor(undefined);setPrevious({ownerKey:"",items:[]});};
  const submit=(event:FormEvent)=>{event.preventDefault();reset();setSearch(draft.trim());};
  const items=[...(previous.ownerKey===resource.ownerKey?previous.items:[]),...(resource.data?.items??[])];
  return <GroupShell locale={locale}>
    <header className={styles.discoveryIntro}><h1>{c.title}</h1><p>{c.intro}</p></header>
    {type==='all'&&!search&&<DiscoveryCarousel locale={locale}/>}
    {featured.data?.items.length? <section className={styles.featured} aria-label={featuredTitle[locale]}><h2>{featuredTitle[locale]}</h2><div>{featured.data.items.slice(0,3).map(page=><Link className={styles.featuredItem} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><span><strong>{page.name}</strong><span className={styles.meta}>{t[page.kind]} · {page.memberCount.toLocaleString(locale)}</span></span><ArrowRight aria-hidden="true"/></Link>)}</div></section>:null}
    <div className={`${styles.layout} ${styles.discoveryLayout}`}><section className={styles.main} aria-label={t.explore}>
      <div className={styles.discoveryHeading}><h2>{t.explore}</h2>{resource.data&&!resource.loading&&!resource.error&&<output aria-live="polite" className={styles.meta}>{t.all} {(resource.data.totalCount??items.length).toLocaleString(locale)}{resource.data.totalCount===undefined&&resource.data.nextCursor?'+':''}</output>}</div>
      <div className={styles.discoveryControls}><div className={styles.filters} aria-label={t.groups}>{(["all","fan","hobby","brand"] as const).map(value=><button className={styles.chip} aria-pressed={type===value} key={value} onClick={()=>{reset();setType(value);}}>{t[value]}</button>)}</div>
      <form className={styles.search} onSubmit={submit}><input className={styles.input} aria-label={t.searchPlaceholder} placeholder={t.searchPlaceholder} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={100}/><button className={styles.searchIcon} aria-label={t.search}><Search size={18}/></button></form>
      <Menu.Root><Menu.Trigger className={`${styles.select} ${sortStyles.trigger}`} aria-label={t.popular}>{sort==='popular'?(type==='fan'?t.popular:c.membersSort):c.defaultSort}<ChevronDown size={18} aria-hidden/></Menu.Trigger><Menu.Portal><Menu.Positioner align='end' sideOffset={4} className={sortStyles.positioner}><Menu.Popup className={sortStyles.popup} data-source-node='XnL4z' aria-label={t.popular}><Menu.RadioGroup className={sortStyles.group} value={sort} onValueChange={value=>{if(value==='recent'||value==='popular'){reset();setSort(value);}}}><Menu.RadioItem className={sortStyles.item} value='recent'>{c.defaultSort}</Menu.RadioItem><Menu.RadioItem className={sortStyles.item} value='popular'>{type==='fan'?t.popular:c.membersSort}</Menu.RadioItem></Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>
      {type==='fan'&&<div className={`${styles.filters} ${styles.artistFilters}`} aria-label={t.fan}>{(['all','idol','singer','actor','creator','show_host'] as const).map(role=><button key={role} className={styles.chip} aria-pressed={(artistRole??'all')===role} onClick={()=>{reset();updateQuery('artistRole',role==='all'?undefined:role);}}>{creatorRoleFilterLabel(role,locale)}</button>)}</div>}
      {(mine||initialOwned)&&<div className={styles.toolbar}><button className={styles.chip} aria-pressed={mine==="joined"} onClick={()=>{reset();setMine(mine==="joined"?undefined:"joined");}}>{t.joinedPages}</button><button className={styles.chip} aria-pressed={mine==="bookmarked"} onClick={()=>{reset();setMine(mine==="bookmarked"?undefined:"bookmarked");}}>{t.bookmark}</button></div>}
      {resource.error?<SourceStatePanel sourceId="J4WKn" title={locale==='ko'?'모임 목록을 불러오지 못했어요':t.error} description={locale==='ko'?'목록을 다시 불러와 주세요.':t.error} icon={<CircleAlert size={24}/>} feedback="danger" role="alert" actions={[{label:t.retry,onClick:resource.retry,variant:'primary'}]}/>:resource.loading?<p className={styles.status} role="status">{t.loading}</p>:items.length?<div className={`${styles.grid} ${styles.directoryGrid}`}>{items.map(page=><Link className={`${styles.card} ${styles.directoryCard}`} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><span className={styles.cardCopy}><strong>{page.name}</strong><span className={styles.meta}>{t[page.kind]} · {page.memberCount.toLocaleString(locale)}</span><span className={styles.meta}>{page.description}</span></span><ArrowRight className={styles.arrow} aria-hidden="true"/></Link>)}</div>:<SourceStatePanel sourceId={mine==='joined'?'C41qR2':'nHfwZ'} title={locale==='ko'?mine==='joined'?'아직 가입한 모임이 없어요':'검색 결과가 없어요':t.empty} description={locale==='ko'?mine==='joined'?'전체 모임에서 관심 있는 모임을 찾아보세요.':'검색어와 분류를 바꿔 보세요.':t.empty} icon={mine==='joined'?<UsersRound size={24}/>:<SearchX size={24}/>} role="status" actions={mine==='joined'?[{label:locale==='ko'?'전체 보기':t.all,href:`/pages/groups?locale=${locale}`,variant:'primary'}]:[{label:locale==='ko'?'필터 초기화':t.all,onClick:()=>{reset();setSearch('');setType('all');setMine(undefined);updateQuery('artistRole',undefined);setDraft('');},variant:'primary'},{label:locale==='ko'?'최애 요청':t.explore,href:`/celebrities?locale=${locale}`}]} />}
      {resource.data?.nextCursor&&<FanAction className={styles.more} fullWidth onClick={()=>{setPrevious({ownerKey:resource.ownerKey,items});setCursor(resource.data?.nextCursor??undefined);}} trailingIcon={<ArrowRight/>}>{t.more}</FanAction>}
    </section><aside className={styles.discoveryAside}><section className={styles.discoveryJoined}><h2>{t.myPages}</h2>{resource.authenticated?joined.loading?<p role="status">{t.loading}</p>:joined.error?<FanAction onClick={joined.retry}>{t.retry}</FanAction>:!joined.data?.items.length?<p>{t.empty}</p>:joined.data.items.slice(0,3).map(page=><Link className={styles.joinedRow} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><strong>{page.name}</strong></Link>):<FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups?locale=${locale}`)}`}>{t.login}</FanAction>}
      {resource.authenticated&&<FanAction href={`/pages/groups?locale=${locale}&mine=joined`} variant="text" trailingIcon={<ArrowRight/>}>{locale==='ko'?'내 페이지 전체 보기':t.joinedPages} · {joined.data?.totalCount??joined.data?.items.length??'—'}{joined.data?.totalCount===undefined&&joined.data?.nextCursor?'+':''}</FanAction>}</section>
      <section className={styles.discoveryAttendance}><div><h3>{c.attendance}</h3><p>{c.attendanceBody}</p></div><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} variant="primary">{w.attendance}</FanAction></section>
      <div className={styles.discoveryCreation}><section><h3>{c.fanTitle}</h3><p>{c.fanBody}</p><FanAction href={`/pages/groups/apply?locale=${locale}&kind=fan`} variant="text" trailingIcon={<ArrowRight/>}>{locale==='ko'?'팬페이지 개설 신청':t.apply}</FanAction></section>
      <section><h3>{c.otherTitle}</h3><p>{c.otherBody}</p><FanAction href={`/pages/groups/apply?locale=${locale}`} variant="text" trailingIcon={<ArrowRight/>}>{t.apply}</FanAction></section></div>
    </aside></div>
  </GroupShell>;
}
