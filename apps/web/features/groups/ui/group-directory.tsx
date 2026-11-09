"use client";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { activeJjinfanChallengesSchema } from "@/features/rankings/domain/types";
import {WalletAttendanceDialog} from "@/features/group-wallet/ui/wallet-screen";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {Menu} from "@base-ui/react/menu";
import sortStyles from "./group-directory-sort.module.css";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import { ArrowDownUp, ArrowRight, ChevronRight, Search,ChevronDown,CircleAlert } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanEntityCard } from "@/components/fan-ui/fan-entity-card";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import cornerStyles from "@/components/fan-ui/earn-corner.module.css";
import { checkinNumbers } from "@/features/dukjil/domain/dukjil-ui";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { applicationStatusListSchema, type ApplicationStatus } from "../domain/application-status";
import { groupApplyText, type GroupApplyCopyKey } from "./group-apply-copy";
import directoryStyles from "./group-directory.module.css";
import { fanLoginHref } from "@/components/login-href";
import type { AppLocale } from "@/i18n/locales";
import { groupApiQuery, groupHref, groupListSchema, type GroupList } from "../domain/contracts";
import { useGroupResource } from "./use-group-resource";
import { groupsCopy } from "./copy";
import { GroupShell } from "./group-shell";
import { HotPosts, MyArtists, ThinCarousel } from "./directory-top";
import { creatorRoleFilterLabel } from "@/features/creator/domain/creator-role";
import { discoveryCopy } from "./discovery-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import styles from "./groups.module.css";
import stateStyles from "./group-directory-state.module.css";
import loadingStyles from "./group-directory-loading.module.css";
import {SourceStatePanel} from "./source-state-panel";
import {DirectoryAreaError} from "./directory-area-error";
import {GroupApplicationDialog} from "./group-application-dialog";
const parseChallenges=(value:unknown)=>activeJjinfanChallengesSchema.parse(value);
export const seeAllLabel:Record<AppLocale,string>={ko:'전체 보기',en:'View all',ja:'すべて見る','zh-Hans':'查看全部','zh-Hant':'查看全部',es:'Ver todo',id:'Lihat semua',vi:'Xem tất cả',th:'ดูทั้งหมด',pt:'Ver tudo',fr:'Tout voir',ru:'Все страницы'};
const fanpageLabel:Record<AppLocale,string>={ko:'팬페이지',en:'Fan pages',ja:'ファンページ','zh-Hans':'粉丝主页','zh-Hant':'粉絲專頁',es:'Páginas de fans',id:'Halaman penggemar',vi:'Trang người hâm mộ',th:'แฟนเพจ',pt:'Páginas de fãs',fr:'Pages de fans',ru:'Фан-страницы'};
const resetFiltersLabel:Record<AppLocale,string>={ko:'필터 초기화',en:'Reset filters',ja:'フィルターをリセット','zh-Hans':'重置筛选','zh-Hant':'重設篩選',es:'Restablecer filtros',id:'Atur ulang filter',vi:'Đặt lại bộ lọc',th:'รีเซ็ตตัวกรอง',pt:'Redefinir filtros',fr:'Réinitialiser les filtres',ru:'Сбросить фильтры'};
const visitOrderLabel:Record<AppLocale,string>={ko:"최근 방문순",en:"Recently visited",ja:"最近の訪問順",'zh-Hans':"最近访问",'zh-Hant':"最近瀏覽",es:"Visitas recientes",id:"Kunjungan terbaru",vi:"Truy cập gần đây",th:"เข้าชมล่าสุด",pt:"Visitas recentes",fr:"Visites récentes",ru:"Недавние посещения"};
function DirectorySkeleton({kind,label}:{kind:"directory"|"joined";label:string}) {
 return <FanSkeletonRows rows={kind==="directory"?6:3} variant={kind==="directory"?"tile":"entity"} ariaLabel={label} className={kind==="joined"?undefined:directoryStyles.list}/>;
}
// Check-in is a catalog rule and not an action, and this button covers every page, so it shows the points and no done state.
function CheckinCorner({locale,children}:{locale:AppLocale;children:ReactNode}){
 const {points}=checkinNumbers(useDukjil()?.catalog);
 return <span className={`${cornerStyles.host} ${directoryStyles.attendanceAction}`}>{children}{points!==undefined&&<EarnBadge variant="corner" locale={locale} points={points}/>}</span>;
}
// Marks a sideways-scrolling row with data-scrolls so its end keeps room after the last chip.
function useOverflowHint(){
 const ref=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{const node=ref.current;if(!node)return;
  const update=()=>{node.removeAttribute('data-scrolls');node.toggleAttribute('data-scrolls',node.scrollWidth>node.clientWidth+1);};
  update();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(update);observer?.observe(node);
  return()=>observer?.disconnect();},[]);
 return ref;
}
const parseStatus=(value:unknown)=>applicationStatusListSchema.parse(value);
const statusLabel:Record<ApplicationStatus["status"],GroupApplyCopyKey>={submitted:"statusReviewing",reviewing:"statusReviewing",changes_requested:"statusChanges",approved:"statusApproved",rejected:"statusRejected"};
const parseList = (value:unknown)=>groupListSchema.parse(value);
const SEARCH_DELAY_MS=300;
const ROLE_FILTERS=['all','idol','singer','actor','creator','show_host'] as const;
const joinedErrorLabel:Record<AppLocale,string>={ko:'내 페이지를 불러오지 못했어요',en:'We couldn’t load your pages',ja:'マイページを読み込めませんでした','zh-Hans':'无法加载我的页面','zh-Hant':'無法載入我的頁面',es:'No pudimos cargar tus páginas',id:'Halaman Anda tidak dapat dimuat',vi:'Không thể tải các trang của bạn',th:'ไม่สามารถโหลดเพจของคุณได้',pt:'Não foi possível carregar suas páginas',fr:'Impossible de charger vos pages',ru:'Не удалось загрузить ваши страницы'};
export function GroupDirectory({locale,initialOwned=false,banners=[]}:{locale:AppLocale;banners?:HomeBanner[];initialMine?:"joined"|"bookmarked";initialType?:"all"|"fan"|"hobby"|"brand";initialSearch?:string;initialSort?:"popular"|"recent";initialOwned?:boolean}) {
  const t=groupsCopy(locale),c=discoveryCopy(locale),w=walletCopy(locale);
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const attendanceTrigger=useRef<HTMLAnchorElement|null>(null);
 const filterBar=useOverflowHint();
  const query=useSearchParams();
  const directoryLoginQuery=new URLSearchParams(query?.toString()??'');directoryLoginQuery.set('locale',locale);
  const directoryLogin=fanLoginHref(locale,`/pages/groups?${directoryLoginQuery}`);
  const type=query.get("type")??"all",search=query.get("search")??"",sort=query.get("sort")??"recent",mine=query.get("mine")??undefined,artistRole=query.get("artistRole")??undefined;
  const nonFanType=type==='hobby'||type==='brand';
  const activeRole=!nonFanType?ROLE_FILTERS.find(role=>role!=='all'&&role===artistRole):undefined;
  const [draftState,setDraftState]=useState({search,value:search}),[composing,setComposing]=useState(false);
  const [application,setApplication]=useState<{kind:"fan"|"hobby";name?:string}|null>(null);
  const openApplication=(event:MouseEvent<HTMLAnchorElement>,kind:"fan"|"hobby")=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setApplication({kind});};
  // The URL value follows our own typing (trimmed); only an outside change (reset, navigation) replaces what the user typed.
  if(draftState.search!==search)setDraftState({search,value:draftState.value.trim()===search?draftState.value:search});
  const draft=draftState.value;
  const setDraft=(value:string)=>setDraftState({search,value});
  const updateQuery=(key:string,value:string|undefined)=>{const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);window.history.replaceState(null,'',url.pathname+url.search+url.hash);};
  const setType=(value:string)=>updateQuery('type',value),setSearch=(value:string)=>updateQuery('search',value),setSort=(value:string)=>updateQuery('sort',value),setMine=(value:string|undefined)=>updateQuery('mine',value);
  const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{ownerKey:string;items:GroupList["items"]}>({ownerKey:"",items:[]});
  // A role filters fan pages, so choosing one on the all tab reads the fan list.
  const listType=type==='all'&&artistRole?'fan':type;
  const listKey=[type,search,sort,mine,artistRole,initialOwned].join('|');
  // Any change of the list, also from a link, starts again at its first page. The screen itself stays mounted.
  const [cursorKey,setCursorKey]=useState(listKey);
  if(cursorKey!==listKey){setCursorKey(listKey);setCursor(undefined);setPrevious({ownerKey:"",items:[]});}
  const listQuery=groupApiQuery({type:listType,search,sort,mine,cursor,limit:'20',artistRole:listType==='fan'?artistRole:undefined,owned:initialOwned?"1":undefined});
  const resource=useGroupResource(listQuery,parseList);
  const [joinedPages,setJoinedPages]=useState<{ownerKey:string;cursors:(string|undefined)[]}>({ownerKey:"",cursors:[undefined]});
  useEffect(()=>{setJoinedPages({ownerKey:resource.ownerKey,cursors:[undefined]});},[resource.ownerKey,resource.authenticated]);
  const joinedCursors=joinedPages.ownerKey===resource.ownerKey?joinedPages.cursors:[undefined];
  const joined=useGroupResource(resource.ready&&resource.authenticated?groupApiQuery({mine:"joined",sort:"visited",limit:"3",cursor:joinedCursors.at(-1)}):null,parseList);
  const myApplication=useGroupResource(resource.ready&&resource.authenticated?'/api/groups/applications/status?limit=1':null,parseStatus).data?.items[0];
  const pagination=waveFriendsCopy(locale);
  const filtersActive=Boolean(search||type!=='all'||mine||artistRole);
  // Once a search, filter or order is used, the list keeps a screen of height for the rest of the visit, so narrowing it never pulls the page up.
  const [holdHeight,setHoldHeight]=useState(filtersActive||sort!=='recent');
  if(!holdHeight&&(filtersActive||sort!=='recent'))setHoldHeight(true);
  const showJoinedAll=resource.authenticated&&!(joined.data&&!joined.data.items.length);
  const joinedCount=joined.data?.totalCount??joined.data?.items.length;
  const submit=(event:FormEvent)=>{event.preventDefault();setSearch(draft.trim());};
  // Typing searches by itself after a pause; never while a Korean/Japanese/Chinese composition is still open.
  useEffect(()=>{
    const next=draft.trim();if(composing||next===search)return;
    const timer=window.setTimeout(()=>{setSearch(next);},SEARCH_DELAY_MS);
    return ()=>window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearch only writes the URL
  },[draft,search,composing]);
  // While another search or filter loads, keep the cards already on screen.
  const [shown,setShown]=useState<{query:string;ownerKey:string;data:GroupList}>();
  if(resource.data&&shown?.query!==listQuery)setShown({query:listQuery,ownerKey:resource.ownerKey,data:resource.data});
  const listData=resource.data??(resource.loading&&shown?.ownerKey===resource.ownerKey?shown.data:undefined),refreshing=!resource.data&&Boolean(listData);
  const items=[...(previous.ownerKey===resource.ownerKey?previous.items:[]),...(listData?.items??[])];
  const listedCount=listData?.totalCount??items.length;
  // The joined and bookmarked switch stays once shown, so turning it off moves nothing below.
  const [mineRow,setMineRow]=useState(Boolean(mine||initialOwned));
  if(mine&&!mineRow)setMineRow(true);
  // 찐팬 100 challenge (C7): fan pages an administrator turned on carry a tag in every list on this screen.
  const challenges=useRankingResource(`/api/rankings/challenges?locale=${locale}`,parseChallenges),challengeSlugs=new Set(challenges.state.status==='ready'?challenges.state.data.items.map(item=>item.slug):[]);
  const pageCard=(page:GroupList["items"][number],size:"row"|"list"|"tile",count=true)=><FanEntityCard key={page.id} size={size} href={groupHref(page,locale)} image={{src:page.imageUrl,slug:page.slug}} name={page.name} kind={page.kind} locale={locale} memberCount={count?page.memberCount:undefined} badge={page.kind==='fan'&&page.slug&&challengeSlugs.has(page.slug)?<FanTag tone="fan">{rankingsText(locale,'jjTag')}</FanTag>:undefined}/>;
  const applyKind=nonFanType?'hobby':'fan';
  const applyLabel=nonFanType?t.apply:groupApplyText(locale,'fanPageApply');
  const attendanceAction=!resource.authenticated?<FanAction className={styles.discoveryAttendanceGuest} variant="neutral" href={directoryLogin}>{w.attendance}</FanAction>:<FanAction href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} variant="primary">{w.attendance}</FanAction>;
  return <GroupShell locale={locale}>
    <header className={styles.discoveryIntro}><FanHeading as="h1">{c.title}</FanHeading></header>
    <MyArtists locale={locale} loginPath={`/pages/groups?${directoryLoginQuery}`}/>
    <ThinCarousel banners={banners} locale={locale}/>
    <div className={`${styles.layout} ${styles.discoveryLayout}`}><section className={styles.main} aria-label={t.explore} id="directory-explore" data-directory-explore="" data-filtered={holdHeight||undefined}>
      <HotPosts locale={locale}/>
      <div className={styles.discoveryHeading}><h2>{t.explore}</h2>{listData&&!resource.error&&<output aria-live="polite" className={styles.meta}>{t.all} {listedCount.toLocaleString(locale)}{listData.totalCount===undefined&&listData.nextCursor?'+':''}</output>}</div>
      <div className={directoryStyles.controls}>
      <form className={`${styles.search} ${directoryStyles.search}`} onSubmit={submit}><input className={`${styles.input} ${directoryStyles.searchInput}`} aria-label={t.searchPlaceholder} placeholder={t.searchPlaceholder} value={draft} onChange={e=>setDraft(e.target.value)} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)} maxLength={100}/><button className={directoryStyles.searchIcon} aria-label={t.search}><Search size={18}/></button></form>
      <Menu.Root><Menu.Trigger className={`${sortStyles.trigger} ${directoryStyles.sort}`} data-active={sort==='popular'?'':undefined}><ArrowDownUp className={directoryStyles.sortIcon} size={18} aria-hidden/><span className={directoryStyles.sortLabel}>{sort==='popular'?t.popular:c.defaultSort}</span><ChevronDown className={directoryStyles.sortChevron} size={16} aria-hidden/></Menu.Trigger><Menu.Portal><Menu.Positioner align='end' sideOffset={4} className={sortStyles.positioner}><Menu.Popup className={sortStyles.popup} data-source-node='XnL4z' aria-label={t.popular}><Menu.RadioGroup className={sortStyles.group} value={sort} onValueChange={value=>{if(value==='recent'||value==='popular')setSort(value);}}><Menu.RadioItem className={sortStyles.item} value='recent'>{c.defaultSort}</Menu.RadioItem><Menu.RadioItem className={sortStyles.item} value='popular'>{t.popular}</Menu.RadioItem></Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
      <div ref={filterBar} className={directoryStyles.filterBar} aria-label={t.explore}><button className={`${styles.chip} ${directoryStyles.chip}`} aria-pressed={type==='all'} onClick={()=>setType('all')}>{t.all}</button><button className={`${styles.chip} ${directoryStyles.chip}`} aria-pressed={type==='fan'} onClick={()=>setType('fan')}>{fanpageLabel[locale]}</button><div className={directoryStyles.groupKinds} role="group" aria-label={t.groups}><span className={directoryStyles.groupLabel}>{t.groups}</span>{(['hobby','brand'] as const).map(value=><button className={`${styles.chip} ${directoryStyles.chip}`} aria-pressed={type===value} key={value} onClick={()=>{if(artistRole)updateQuery('artistRole',undefined);setType(value);}}>{t[value]}</button>)}</div>
      <Menu.Root><Menu.Trigger className={`${styles.chip} ${directoryStyles.chip} ${directoryStyles.roleTrigger}`} disabled={nonFanType} data-active={activeRole?'':undefined} aria-label={`${groupApplyText(locale,'roleFilter')}: ${creatorRoleFilterLabel(activeRole??'all',locale)}`}>{activeRole?creatorRoleFilterLabel(activeRole,locale):groupApplyText(locale,'roleFilter')}<ChevronDown size={16} aria-hidden/></Menu.Trigger><Menu.Portal><Menu.Positioner align='start' sideOffset={4} className={sortStyles.positioner}><Menu.Popup className={sortStyles.popup} aria-label={groupApplyText(locale,'roleFilter')}><Menu.RadioGroup className={sortStyles.group} value={activeRole??'all'} onValueChange={value=>updateQuery('artistRole',value==='all'?undefined:String(value))}>{ROLE_FILTERS.map(role=><Menu.RadioItem key={role} className={sortStyles.item} value={role}>{creatorRoleFilterLabel(role,locale)}</Menu.RadioItem>)}</Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>
      </div>
      {mineRow&&<div className={styles.toolbar}><button className={styles.chip} aria-pressed={mine==="joined"} onClick={()=>setMine(mine==="joined"?undefined:"joined")}>{t.joinedPages}</button><button className={styles.chip} aria-pressed={mine==="bookmarked"} onClick={()=>setMine(mine==="bookmarked"?undefined:"bookmarked")}>{t.bookmark}</button></div>}
      {resource.error?<SourceStatePanel sourceId="J4WKn" className={stateStyles.fullWidth} title={locale==='ko'?'페이지 목록을 불러오지 못했어요':t.error} description={locale==='ko'?'목록을 다시 불러와 주세요.':t.error} icon={<CircleAlert size={24}/>} feedback="danger" role="alert" actions={[{label:t.retry,onClick:resource.retry,variant:'primary'}]}/>:resource.loading&&!listData&&!items.length?<DirectorySkeleton kind="directory" label={t.loading}/>:items.length?<div key="list" className={[directoryStyles.list,refreshing?directoryStyles.refreshing:''].filter(Boolean).join(' ')} data-directory-list aria-busy={refreshing||undefined}>{items.map(page=>pageCard(page,"tile"))}</div>:<div key="empty" className={refreshing?directoryStyles.refreshing:undefined} aria-busy={refreshing||undefined}><SourceStatePanel className={stateStyles.fullWidth} sourceId={mine==='joined'?'C41qR2':'nHfwZ'} title={locale==='ko'?mine==='joined'?'아직 가입한 페이지가 없어요':'검색 결과가 없어요':t.empty} illustration={mine==='joined'?'page':'search'} role="status" actions={mine==='joined'?[{label:locale==='ko'?'전체 보기':t.all,href:`/pages/groups?locale=${locale}`,variant:'primary'}]:[...(filtersActive?[{label:resetFiltersLabel[locale],onClick:()=>{const url=new URL(window.location.href);for(const key of ['search','type','mine','artistRole'])url.searchParams.delete(key);window.history.replaceState(null,'',url.pathname+url.search+url.hash);setDraft('');},variant:'primary' as const}]:[]),{label:applyLabel,onClick:()=>setApplication({kind:applyKind,name:search||undefined}),...(filtersActive?{}:{variant:'primary' as const})}]} /></div>}
      {resource.data?.nextCursor&&<FanAction className={styles.more} fullWidth onClick={()=>{setPrevious({ownerKey:resource.ownerKey,items});setCursor(resource.data?.nextCursor??undefined);}} trailingIcon={<ArrowRight/>}>{t.more}</FanAction>}
    </section><aside className={styles.discoveryAside}><section className={styles.discoveryJoined}><header className={loadingStyles.head}><div className={loadingStyles.titles}><h2>{t.myPages}</h2>{resource.authenticated&&!joined.error&&!(joined.data&&!joined.data.items.length)&&<span className={loadingStyles.sort}>{visitOrderLabel[locale]}</span>}</div>{showJoinedAll&&<FanAction href={`/pages/groups?locale=${locale}&mine=joined`} variant="text" className={loadingStyles.all} ariaLabel={locale==='ko'?'내 페이지 전체 보기':`${seeAllLabel[locale]} · ${t.myPages}`}>{seeAllLabel[locale]}{joinedCount!==undefined&&<> · {joinedCount}{joined.data?.totalCount===undefined&&joined.data?.nextCursor?'+':''}</>}</FanAction>}</header>{resource.authenticated?joined.loading&&!joined.data?<DirectorySkeleton kind="joined" label={t.loading}/>:joined.error?<DirectoryAreaError locale={locale} title={joinedErrorLabel[locale]} retryLabel={t.retry} onRetry={joined.retry}/>:!joined.data?.items.length?<SourceStatePanel sourceId="joined-empty" size="compact" illustration="page" role="status" title={locale==='ko'?'아직 가입한 페이지가 없어요':t.empty} description={locale==='ko'?'팬페이지와 모임을 둘러보세요.':undefined}/>:joined.data.items.map(page=>pageCard(page,"row",false)):<div className={styles.lockedJoined}><FanLockedRows rows={2}/><FanAction variant="neutral" fullWidth href={directoryLogin}>{t.login}</FanAction></div>}
      {resource.authenticated&&(joinedCursors.length>1||joined.data?.nextCursor)&&<nav className={loadingStyles.pager} aria-label={t.myPages}><FanAction fullWidth disabled={joined.loading||joinedCursors.length===1} onClick={()=>setJoinedPages({ownerKey:resource.ownerKey,cursors:joinedCursors.slice(0,-1)})}>{pagination.previousPage}</FanAction><FanAction fullWidth disabled={joined.loading||!joined.data?.nextCursor} onClick={()=>{if(joined.data?.nextCursor)setJoinedPages({ownerKey:resource.ownerKey,cursors:[...joinedCursors,joined.data.nextCursor]});}}>{pagination.nextPage}</FanAction></nav>}
      </section>
      <section className={styles.discoveryAttendance}><div><h3>{c.attendance}</h3></div><DukjilProvider locale={locale}><CheckinCorner locale={locale}>{attendanceAction}</CheckinCorner></DukjilProvider></section>
      {myApplication&&<Link className={directoryStyles.myApplication} href={`/pages/groups/apply?view=mine&locale=${locale}` as Route}><span className={directoryStyles.myApplicationCopy}><strong>{groupApplyText(locale,'mineTitle')}</strong><span>{myApplication.name}</span></span><FanTag tone={myApplication.status==='approved'?'fan':myApplication.status==='changes_requested'?'notice':'neutral'}>{groupApplyText(locale,statusLabel[myApplication.status])}</FanTag><ChevronRight size={16} aria-hidden="true"/></Link>}
      <div className={styles.discoveryCreation}><FanAction href={`/pages/groups/apply?locale=${locale}&kind=fan`} onClick={event=>openApplication(event,'fan')} variant="text">{groupApplyText(locale,'fanPageApply')} <span aria-hidden="true">›</span></FanAction><FanAction href={`/pages/groups/apply?locale=${locale}`} onClick={event=>openApplication(event,'hobby')} variant="text">{groupApplyText(locale,'hobbyBrandPageApply')} <span aria-hidden="true">›</span></FanAction></div>
    </aside></div>
    {application&&<GroupApplicationDialog locale={locale} initialKind={application.kind} initialName={application.name} onClose={()=>setApplication(null)}/>}
  {attendanceOpen&&<WalletAttendanceDialog locale={locale} open onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>}
  </GroupShell>;
}
