"use client";
import {WalletAttendanceDialog} from "@/features/group-wallet/ui/wallet-screen";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import {Menu} from "@base-ui/react/menu";
import sortStyles from "./group-directory-sort.module.css";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Search,ChevronDown,CircleAlert } from "lucide-react";
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
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import styles from "./groups.module.css";
import fanStyles from "./group-directory-fan.module.css";
import { GroupImage } from "./group-image";
import loadingStyles from "./group-directory-loading.module.css";
import {SourceStatePanel} from "./source-state-panel";
import {DirectoryAreaError} from "./directory-area-error";
import {GroupApplicationDialog} from "./group-application-dialog";
export const seeAllLabel:Record<AppLocale,string>={ko:'전체 보기',en:'View all',ja:'すべて見る','zh-Hans':'查看全部','zh-Hant':'查看全部',es:'Ver todo',id:'Lihat semua',vi:'Xem tất cả',th:'ดูทั้งหมด',pt:'Ver tudo',fr:'Tout voir',ru:'Все страницы'};
const fanpageLabel:Record<AppLocale,string>={ko:'팬페이지',en:'Fan pages',ja:'ファンページ','zh-Hans':'粉丝主页','zh-Hant':'粉絲專頁',es:'Páginas de fans',id:'Halaman penggemar',vi:'Trang người hâm mộ',th:'แฟนเพจ',pt:'Páginas de fãs',fr:'Pages de fans',ru:'Фан-страницы'};
const resetFiltersLabel:Record<AppLocale,string>={ko:'필터 초기화',en:'Reset filters',ja:'フィルターをリセット','zh-Hans':'重置筛选','zh-Hant':'重設篩選',es:'Restablecer filtros',id:'Atur ulang filter',vi:'Đặt lại bộ lọc',th:'รีเซ็ตตัวกรอง',pt:'Redefinir filtros',fr:'Réinitialiser les filtres',ru:'Сбросить фильтры'};
const favoriteRequestLabel:Record<AppLocale,string>={ko:'최애 요청',en:'Request a favorite',ja:'推しをリクエスト','zh-Hans':'请求添加偶像','zh-Hant':'請求新增偶像',es:'Pedir a tu favorito',id:'Minta favoritmu',vi:'Yêu cầu bias của bạn',th:'ขอศิลปินที่ชอบ',pt:'Pedir seu favorito',fr:'Demander votre favori',ru:'Запросить любимца'};
const visitOrderLabel:Record<AppLocale,string>={ko:"최근 방문순",en:"Recently visited",ja:"最近の訪問順",'zh-Hans':"最近访问",'zh-Hant':"最近瀏覽",es:"Visitas recientes",id:"Kunjungan terbaru",vi:"Truy cập gần đây",th:"เข้าชมล่าสุด",pt:"Visitas recentes",fr:"Visites récentes",ru:"Недавние посещения"};
function DirectorySkeleton({kind,label}:{kind:"featured"|"directory"|"joined";label:string}) {
 return <div role="status" aria-label={label} aria-busy="true" className={`${loadingStyles.skeleton} ${loadingStyles[kind]}`}><div aria-hidden="true" style={{display:"contents"}}>{Array.from({length:kind==="directory"?6:3},(_,i)=><div className={loadingStyles.row} key={i}><span className={loadingStyles.art}/><span className={loadingStyles.copy}><span className={loadingStyles.line}/><span className={loadingStyles.line}/></span></div>)}</div></div>;
}
const parseList = (value:unknown)=>groupListSchema.parse(value);
const featuredErrorLabel:Record<AppLocale,string>={ko:'주목할 페이지를 불러오지 못했어요',en:'We couldn’t load the spotlight pages',ja:'注目のページを読み込めませんでした','zh-Hans':'无法加载热门页面','zh-Hant':'無法載入熱門頁面',es:'No pudimos cargar las páginas destacadas',id:'Halaman pilihan tidak dapat dimuat',vi:'Không thể tải các trang nổi bật',th:'ไม่สามารถโหลดเพจที่น่าสนใจได้',pt:'Não foi possível carregar as páginas em destaque',fr:'Impossible de charger les pages à découvrir',ru:'Не удалось загрузить популярные страницы'};
const joinedErrorLabel:Record<AppLocale,string>={ko:'내 페이지를 불러오지 못했어요',en:'We couldn’t load your pages',ja:'マイページを読み込めませんでした','zh-Hans':'无法加载我的页面','zh-Hant':'無法載入我的頁面',es:'No pudimos cargar tus páginas',id:'Halaman Anda tidak dapat dimuat',vi:'Không thể tải các trang của bạn',th:'ไม่สามารถโหลดเพจของคุณได้',pt:'Não foi possível carregar suas páginas',fr:'Impossible de charger vos pages',ru:'Не удалось загрузить ваши страницы'};
const featuredTitle:Record<AppLocale,string>={ko:'지금 주목할 페이지',en:'Pages in the spotlight',ja:'今注目のページ','zh-Hans':'热门页面','zh-Hant':'熱門頁面',es:'Páginas destacadas',id:'Halaman pilihan',vi:'Trang nổi bật',th:'เพจที่น่าสนใจ',pt:'Páginas em destaque',fr:'Pages à découvrir',ru:'Популярные страницы'};
export function GroupDirectory({locale,initialOwned=false,banners=[]}:{locale:AppLocale;banners?:HomeBanner[];initialMine?:"joined"|"bookmarked";initialType?:"all"|"fan"|"hobby"|"brand";initialSearch?:string;initialSort?:"popular"|"recent";initialOwned?:boolean}) {
  const t=groupsCopy(locale),c=discoveryCopy(locale),w=walletCopy(locale);
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const attendanceTrigger=useRef<HTMLAnchorElement|null>(null);
  const kindLabel=(kind:GroupList["items"][number]["kind"])=>kind==='fan'?fanpageLabel[locale]:`${t.groups} · ${t[kind]}`;
  const query=useSearchParams();
  const type=query.get("type")??"all",search=query.get("search")??"",sort=query.get("sort")??"recent",mine=query.get("mine")??undefined,artistRole=query.get("artistRole")??undefined;
  const [draftState,setDraftState]=useState({search,value:search});
  const [applicationKind,setApplicationKind]=useState<"fan"|"hobby"|null>(null);
  const openApplication=(event:MouseEvent<HTMLAnchorElement>,kind:"fan"|"hobby")=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setApplicationKind(kind);};
  const draft=draftState.search===search?draftState.value:search;
  const setDraft=(value:string)=>setDraftState({search,value});
  const updateQuery=(key:string,value:string|undefined)=>{const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);};
  const setType=(value:string)=>updateQuery('type',value),setSearch=(value:string)=>updateQuery('search',value),setSort=(value:string)=>updateQuery('sort',value),setMine=(value:string|undefined)=>updateQuery('mine',value);
  const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{ownerKey:string;items:GroupList["items"]}>({ownerKey:"",items:[]});
  const fanFirst=type==='all'&&!search&&!mine&&!initialOwned;
  const resource=useGroupResource(groupApiQuery({type:fanFirst?'nonfan':type,search,sort,mine,cursor,limit:'20',artistRole:type==='fan'?artistRole:undefined,owned:initialOwned?"1":undefined}),parseList);
  const fans=useGroupResource(fanFirst?groupApiQuery({type:'fan',sort,limit:'6'}):null,parseList);
  const fanSpotlight=useGroupResource(fanFirst?groupApiQuery({type:'fan',sort:'today',limit:'3'}):null,parseList);
  const fanSpotlightItems=fanSpotlight.data?.items??[];
  const needsFill=fanFirst&&fanSpotlight.ready&&!fanSpotlight.loading&&!fanSpotlight.error&&fanSpotlightItems.length<3;
  const spotlightFill=useGroupResource(needsFill?groupApiQuery({sort:'today',limit:'6'}):null,parseList);
  const featured={error:fanSpotlight.error||spotlightFill.error,retry:()=>{fanSpotlight.retry();if(spotlightFill.error)spotlightFill.retry();},loading:fanSpotlight.loading||(needsFill&&spotlightFill.loading),data:fanSpotlight.data?{items:[...fanSpotlightItems,...(needsFill?spotlightFill.data?.items??[]:[]).filter(page=>!fanSpotlightItems.some(fan=>fan.id===page.id))].slice(0,3)}:undefined};
  const [joinedPages,setJoinedPages]=useState<{ownerKey:string;cursors:(string|undefined)[]}>({ownerKey:"",cursors:[undefined]});
  useEffect(()=>{setJoinedPages({ownerKey:resource.ownerKey,cursors:[undefined]});},[resource.ownerKey,resource.authenticated]);
  const joinedCursors=joinedPages.ownerKey===resource.ownerKey?joinedPages.cursors:[undefined];
  const joined=useGroupResource(resource.ready&&resource.authenticated?groupApiQuery({mine:"joined",sort:"visited",limit:"3",cursor:joinedCursors.at(-1)}):null,parseList);
  const pagination=waveFriendsCopy(locale);
  const showJoinedAll=resource.authenticated&&!(joined.data&&!joined.data.items.length);
  const joinedCount=joined.data?.totalCount??joined.data?.items.length;
  const reset=()=>{setCursor(undefined);setPrevious({ownerKey:"",items:[]});};
  const submit=(event:FormEvent)=>{event.preventDefault();reset();setSearch(draft.trim());};
  const fanItems=fanFirst?fans.data?.items??[]:[];
  const showFanSection=fanItems.length>0;
  const items=[...(previous.ownerKey===resource.ownerKey?previous.items:[]),...(resource.data?.items??[])];
  const listedCount=resource.data?.totalCount??items.length;
  return <GroupShell locale={locale}>
    <header className={styles.discoveryIntro}><h1>{type==='fan'?fanpageLabel[locale]:type==='hobby'||type==='brand'?kindLabel(type):c.title}</h1><p>{c.intro}</p></header>
    {type==='all'&&!search&&<DiscoveryCarousel locale={locale} banners={banners}/>}
    {fanFirst&&<section className={styles.featured} aria-label={featuredTitle[locale]}><h2>{featuredTitle[locale]}</h2>{featured.error?<DirectoryAreaError fit locale={locale} title={featuredErrorLabel[locale]} retryLabel={t.retry} onRetry={featured.retry}/>:featured.loading&&!featured.data?<DirectorySkeleton kind="featured" label={t.loading}/>:featured.data?.items.length?<div>{featured.data.items.slice(0,3).map(page=><Link className={styles.featuredItem} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><span><strong>{page.name}</strong><span className={styles.meta}>{kindLabel(page.kind)} · {page.memberCount.toLocaleString(locale)}</span></span><ArrowRight aria-hidden="true"/></Link>)}</div>:featured.data?<><p>{t.empty}</p><Link className={styles.chip} href={`/celebrities?locale=${locale}` as Route}>{favoriteRequestLabel[locale]}</Link></>:null}</section>}
    <div className={`${styles.layout} ${styles.discoveryLayout}`}><section className={styles.main} aria-label={t.explore}>
      {fanFirst&&fans.error&&<DirectoryAreaError locale={locale} title={t.error} retryLabel={t.retry} onRetry={fans.retry}/>}
      {fanFirst&&fans.loading&&!fans.data&&!fans.error&&<section className={fanStyles.fanSection} aria-hidden="true"><div className={styles.discoveryHeading}><h2>{fanpageLabel[locale]}</h2><span className={fanStyles.all}/></div><div className={fanStyles.fanGrid}>{Array.from({length:6},(_,i)=><span className={fanStyles.fanCard} key={i}><span className={`${fanStyles.fanImage} ${fanStyles.skel}`}/><span className={fanStyles.fanCopy}><strong className={fanStyles.skel}>{"\u00a0"}</strong><span className={`${styles.meta} ${fanStyles.skel}`}>{"\u00a0"}</span></span></span>)}</div></section>}
      {showFanSection&&<section className={fanStyles.fanSection} aria-label={fanpageLabel[locale]}><div className={styles.discoveryHeading}><h2>{fanpageLabel[locale]}</h2><Link className={fanStyles.all} href={`/pages/groups?locale=${locale}&type=fan` as Route}>{seeAllLabel[locale]}{fans.data?.totalCount!==undefined&&<> · {fans.data.totalCount.toLocaleString(locale)}</>}</Link></div><div className={fanStyles.fanGrid}>{fanItems.map(page=><Link className={fanStyles.fanCard} href={groupHref(page,locale) as Route} key={page.id}>{page.imageUrl?<GroupImage locale={locale} src={page.imageUrl} className={fanStyles.fanImage} alt="" width={320} height={320}/>:<span className={`${fanStyles.fanImage} ${fanStyles.fanFallback}`} aria-hidden="true">{page.name.slice(0,2)}</span>}<span className={fanStyles.fanCopy}><strong>{page.name}</strong><span className={styles.meta}>{page.memberCount.toLocaleString(locale)}</span></span></Link>)}</div></section>}
      <div className={styles.discoveryHeading}><h2>{fanFirst?t.groups:t.explore}</h2>{resource.data&&!resource.loading&&!resource.error&&<output aria-live="polite" className={styles.meta}>{t.all} {listedCount.toLocaleString(locale)}{resource.data.totalCount===undefined&&resource.data.nextCursor?'+':''}</output>}</div>
      <div className={styles.discoveryControls}><div className={`${styles.filters} ${styles.directoryFamilyFilters}`} aria-label={t.explore}><button className={styles.chip} aria-pressed={type==='all'} onClick={()=>{reset();setType('all');}}>{t.all}</button><button className={styles.chip} aria-pressed={type==='fan'} onClick={()=>{reset();setType('fan');}}>{fanpageLabel[locale]}</button><div className={styles.filters} role="group" aria-label={t.groups}><span className={styles.meta}>{t.groups}</span>{(['hobby','brand'] as const).map(value=><button className={styles.chip} aria-pressed={type===value} key={value} onClick={()=>{reset();setType(value);}}>{t[value]}</button>)}</div></div>
      <form className={styles.search} onSubmit={submit}><input className={styles.input} aria-label={t.searchPlaceholder} placeholder={t.searchPlaceholder} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={100}/><button className={styles.searchIcon} aria-label={t.search}><Search size={18}/></button></form>
      <Menu.Root><Menu.Trigger className={`${styles.select} ${sortStyles.trigger}`}>{sort==='popular'?(type==='fan'?t.popular:c.membersSort):c.defaultSort}<ChevronDown size={18} aria-hidden/></Menu.Trigger><Menu.Portal><Menu.Positioner align='end' sideOffset={4} className={sortStyles.positioner}><Menu.Popup className={sortStyles.popup} data-source-node='XnL4z' aria-label={t.popular}><Menu.RadioGroup className={sortStyles.group} value={sort} onValueChange={value=>{if(value==='recent'||value==='popular'){reset();setSort(value);}}}><Menu.RadioItem className={sortStyles.item} value='recent'>{c.defaultSort}</Menu.RadioItem><Menu.RadioItem className={sortStyles.item} value='popular'>{type==='fan'?t.popular:c.membersSort}</Menu.RadioItem></Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>
      {type==='fan'&&<div className={`${styles.filters} ${styles.artistFilters}`} aria-label={t.fan}>{(['all','idol','singer','actor','creator','show_host'] as const).map(role=><button key={role} className={styles.chip} aria-pressed={(artistRole??'all')===role} onClick={()=>{reset();updateQuery('artistRole',role==='all'?undefined:role);}}>{creatorRoleFilterLabel(role,locale)}</button>)}</div>}
      {(mine||initialOwned)&&<div className={styles.toolbar}><button className={styles.chip} aria-pressed={mine==="joined"} onClick={()=>{reset();setMine(mine==="joined"?undefined:"joined");}}>{t.joinedPages}</button><button className={styles.chip} aria-pressed={mine==="bookmarked"} onClick={()=>{reset();setMine(mine==="bookmarked"?undefined:"bookmarked");}}>{t.bookmark}</button></div>}
      {resource.error?<SourceStatePanel sourceId="J4WKn" title={locale==='ko'?'페이지 목록을 불러오지 못했어요':t.error} description={locale==='ko'?'목록을 다시 불러와 주세요.':t.error} icon={<CircleAlert size={24}/>} feedback="danger" role="alert" actions={[{label:t.retry,onClick:resource.retry,variant:'primary'}]}/>:resource.loading&&!resource.data&&!items.length?<DirectorySkeleton kind="directory" label={t.loading}/>:items.length?<div className={`${styles.grid} ${styles.directoryGrid}`}>{items.map(page=><Link className={`${styles.card} ${styles.directoryCard}`} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><span className={styles.cardCopy}><strong>{page.name}</strong><span className={styles.meta}>{kindLabel(page.kind)} · {page.memberCount.toLocaleString(locale)}</span><span className={styles.meta}>{page.description}</span></span><ArrowRight className={styles.arrow} aria-hidden="true"/></Link>)}</div>:<SourceStatePanel sourceId={mine==='joined'?'C41qR2':'nHfwZ'} title={locale==='ko'?mine==='joined'?'아직 가입한 페이지가 없어요':'검색 결과가 없어요':t.empty} illustration={mine==='joined'?'page':'search'} role="status" actions={mine==='joined'?[{label:locale==='ko'?'전체 보기':t.all,href:`/pages/groups?locale=${locale}`,variant:'primary'}]:[{label:resetFiltersLabel[locale],onClick:()=>{reset();setSearch('');setType('all');setMine(undefined);updateQuery('artistRole',undefined);setDraft('');},variant:'primary'},{label:favoriteRequestLabel[locale],href:`/celebrities?locale=${locale}`}]} />}
      {resource.data?.nextCursor&&<FanAction className={styles.more} fullWidth onClick={()=>{setPrevious({ownerKey:resource.ownerKey,items});setCursor(resource.data?.nextCursor??undefined);}} trailingIcon={<ArrowRight/>}>{t.more}</FanAction>}
    </section><aside className={styles.discoveryAside}><section className={styles.discoveryJoined}><header className={loadingStyles.head}><div className={loadingStyles.titles}><h2>{t.myPages}</h2>{resource.authenticated&&!joined.error&&!(joined.data&&!joined.data.items.length)&&<span className={loadingStyles.sort}>{visitOrderLabel[locale]}</span>}</div>{showJoinedAll&&<FanAction href={`/pages/groups?locale=${locale}&mine=joined`} variant="text" className={loadingStyles.all} ariaLabel={locale==='ko'?'내 페이지 전체 보기':`${seeAllLabel[locale]} · ${t.myPages}`}>{seeAllLabel[locale]}{joinedCount!==undefined&&<> · {joinedCount}{joined.data?.totalCount===undefined&&joined.data?.nextCursor?'+':''}</>}</FanAction>}</header>{resource.authenticated?joined.loading&&!joined.data?<DirectorySkeleton kind="joined" label={t.loading}/>:joined.error?<DirectoryAreaError locale={locale} title={joinedErrorLabel[locale]} retryLabel={t.retry} onRetry={joined.retry}/>:!joined.data?.items.length?<SourceStatePanel sourceId="joined-empty" size="compact" illustration="page" role="status" title={locale==='ko'?'아직 가입한 페이지가 없어요':t.empty} description={locale==='ko'?'팬페이지와 모임을 둘러보세요.':undefined}/>:joined.data.items.map(page=><Link className={styles.joinedRow} href={groupHref(page,locale) as Route} key={page.id}><GroupAvatar page={page} locale={locale}/><span className={styles.cardCopy}><strong>{page.name}</strong><span className={styles.meta}>{kindLabel(page.kind)}</span></span></Link>):<FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups?locale=${locale}`)}`}>{t.login}</FanAction>}
      {resource.authenticated&&(joinedCursors.length>1||joined.data?.nextCursor)&&<nav className={styles.actions} aria-label={t.myPages}><FanAction className={styles.roomCreateAction} disabled={joined.loading||joinedCursors.length===1} onClick={()=>setJoinedPages({ownerKey:resource.ownerKey,cursors:joinedCursors.slice(0,-1)})}>{pagination.previousPage}</FanAction><FanAction className={styles.roomCreateAction} disabled={joined.loading||!joined.data?.nextCursor} onClick={()=>{if(joined.data?.nextCursor)setJoinedPages({ownerKey:resource.ownerKey,cursors:[...joinedCursors,joined.data.nextCursor]});}}>{pagination.nextPage}</FanAction></nav>}
      </section>
      <section className={styles.discoveryAttendance}><div><h3>{c.attendance}</h3><p>{c.attendanceBody}</p></div><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} variant="primary">{w.attendance}</FanAction></section>
      <div className={styles.discoveryCreation}><section><h3>{c.fanTitle}</h3><p>{c.fanBody}</p><FanAction href={`/pages/groups/apply?locale=${locale}&kind=fan`} onClick={event=>openApplication(event,'fan')} variant="text" trailingIcon={<ArrowRight/>}>{locale==='ko'?'팬페이지 개설 신청':t.apply}</FanAction></section>
      <section><h3>{c.otherTitle}</h3><p>{c.otherBody}</p><FanAction href={`/pages/groups/apply?locale=${locale}`} onClick={event=>openApplication(event,'hobby')} variant="text" trailingIcon={<ArrowRight/>}>{t.apply}</FanAction></section></div>
    </aside></div>
    {applicationKind&&<GroupApplicationDialog locale={locale} initialKind={applicationKind} onClose={()=>setApplicationKind(null)}/>}
  {attendanceOpen&&<WalletAttendanceDialog locale={locale} open onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>}
  </GroupShell>;
}
