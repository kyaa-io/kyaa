"use client";
import {WalletHistoryPanel} from '@/features/group-wallet/ui/wallet-screen';
import {WalletBalances,WalletCard} from '@/features/group-wallet/ui/wallet-card';
import {StanWallet,type StanSlot} from '@/features/group-wallet/ui/stan-wallet';
import {openingPage} from '@/features/passport/ui/passport-mission-book';
import {passportRoadmapSchema} from '@/features/passport/domain/dukjil-types';
import {useSelectedBias,type SelectedBias,type SelectedBiasOption} from '@/features/selected-bias/ui/use-selected-bias';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Route} from 'next';
import {ChevronRight,Ticket} from 'lucide-react';
import {FanAppFrame,FanContentContainer} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {MyAttendanceList,GuestAttendanceList,AttendanceSkeleton} from '@/features/dukjil/ui/my-attendance-list';
import {FanMissions} from '@/features/dukjil/ui/fan-missions';
import {CreatorAttendanceEntry} from '@/features/dukjil/ui/creator-attendance-entry';
import {groupListSchema} from '@/features/groups/domain/contracts';
import {DukjilProvider,useDukjilStatus} from '@/features/dukjil/ui/dukjil-provider';
import {dukjilText} from '@/features/dukjil/ui/dukjil-copy';
import {messages as myMessages} from '@/i18n/catalogs/features__my__ui__my-screen';
import {translate} from '@/i18n/messages';
import {FanHeading} from '@/components/fan-ui/fan-heading';
import {FanState} from '@/components/fan-ui/fan-state';
import {FanLockedRows,FanLockedValue} from '@/components/fan-ui/fan-locked-value';
import {fanLoginHref} from '@/components/login-href';
import {type AppLocale} from '@/i18n/locales';
import {groupBenefitsCatalogSchema,type GroupBenefitsCatalog} from '@/server/group-benefits/domain';
import {walletSchema} from '@/server/group-wallet/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {GroupImage} from './group-image';
import {GROUP_WALLET_CHANGED_EVENT,useGroupRequest,useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {FanSkeletonRows} from '@/components/fan-ui/fan-skeleton';
import {seeAllLabel} from './group-directory';
import {groupBenefitsCopy,benefitsRaffleState} from './group-benefits-copy';
import {StanCheer,StanLucky,stanFavorite} from './stan-lucky-cheer';
import styles from './group-benefits.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const parseRaffles=(value:unknown)=>groupBenefitsCatalogSchema.options[0].parse(value);
const TODAY_ROWS=5,HISTORY_ROWS=3;
const parseJoined=(value:unknown)=>groupListSchema.parse(value);
const parseRoadmap=(value:unknown)=>passportRoadmapSchema.parse(value);
/** The favorite of this screen: while the browser signs in, the favorite the server read for this request (so the first HTML has it); a request the server saw signed out is a guest at once. */
function useStanBias(locale:AppLocale,initial:SelectedBiasOption|null,signedOut:boolean):SelectedBias{
 const live=useSelectedBias(locale);
 return live.status==='loading'&&initial?{...live,status:'ready',selected:initial}:live.status==='loading'&&signedOut?{...live,status:'guest'}:live;
}
const lessLabel=(locale:AppLocale)=>locale==='ko'?'접기':translate(locale,myMessages.ma9d92b36cfae,'Show less');
/** Section failures: when every mounted section failed, the screen shows one alert (in the wallet slot) with one retry instead of one error per section. */
type SectionState={failed:boolean;retry:()=>void};
type SectionRegistry={report:(id:string,state:SectionState|null)=>void;allFailed:boolean;retryAll:()=>void};
const SectionContext=createContext<SectionRegistry|null>(null);
function BenefitsSections({children}:{children:ReactNode}){
 const [sections,setSections]=useState<Record<string,SectionState>>({});
 const report=useCallback((id:string,state:SectionState|null)=>setSections(current=>{if(state)return {...current,[id]:state};const {[id]:_removed,...rest}=current;return rest;}),[]);
 const states=Object.values(sections),allFailed=states.length>=2&&states.every(state=>state.failed),retryAll=()=>states.forEach(state=>state.retry());
 return <SectionContext.Provider value={{report,allFailed,retryAll}}>{children}</SectionContext.Provider>;
}
/** Reports one section's failure state; returns true when the combined alert replaces this section's own content (the section stays mounted, hidden, so its retry still works). */
function useSectionFailure(id:string,failed:boolean,retry:()=>void){
 const ctx=useContext(SectionContext),retryRef=useRef(retry),report=ctx?.report;
 useEffect(()=>{retryRef.current=retry;});
 useEffect(()=>{if(!report)return;report(id,{failed,retry:()=>retryRef.current()});return()=>report(id,null);},[report,id,failed]);
 return Boolean(ctx?.allFailed&&failed);
}
export function GroupBenefitsScreen({locale,initialHeart=null,signedOut=false}:{locale:AppLocale;initialHeart?:SelectedBiasOption|null;signedOut?:boolean}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale),bias=useStanBias(locale,initialHeart,signedOut);
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main'><FanContentContainer as='main' id='benefits-main' className={styles.page}>
 <header className={styles.srOnly}><FanHeading as='h1'>{c.title}</FanHeading></header>
 <BenefitsAlerts><BenefitsSections><BenefitsAlertList/>
 <div className={styles.top}><BenefitsWallet key={`${locale}:${auth.ownerKey}`} locale={locale} signedOut={signedOut} bias={bias}/></div>
 <div className={styles.main}><BenefitsDailyMissions locale={locale}/><BenefitsToday locale={locale} emphasise={false}/><BenefitsLucky locale={locale} bias={bias} signedOut={signedOut}/></div>
 <div className={styles.side}><BenefitsCheer locale={locale} bias={bias} signedOut={signedOut}/>{auth.ready?(auth.authenticated?<BenefitsHistory locale={locale}/>:<BenefitsGuestHistory locale={locale}/>):signedOut&&<BenefitsGuestHistory locale={locale}/>}</div></BenefitsSections></BenefitsAlerts>
 </FanContentContainer></FanAppFrame>;
}
/** The numbers the wallet and the cheer card share (C9): stamps are the stamped slots of the passport page being filled (the MY card's number), hearts come with the summary. */
function useStanNumbers(bias:SelectedBias,signedOut:boolean){
 const auth=useGroupRequest(),guest=(!auth.ready&&signedOut)||(auth.ready&&!auth.authenticated)||bias.status==='guest';
 const passportId=auth.authenticated?bias.selected?.passportId:undefined,roadmap=useGroupResource(passportId?`/api/me/passports/${encodeURIComponent(passportId)}/roadmap`:null,parseRoadmap);
 const page=roadmap.data?roadmap.data.pages[openingPage(roadmap.data.pages)]:undefined;
 const stamps:StanSlot=guest?'locked':!bias.selected?(bias.status==='loading'?'loading':0):page?page.filled:roadmap.data?0:roadmap.error?'missing':'loading';
 const hearts:StanSlot=guest?'locked':bias.status==='loading'?'loading':bias.selected?bias.selected.hearts??'missing':0;
 return {guest,stamps,hearts,passportId};
}
/** F2: the favorite's lucky draws, in the body under the missions (1024+: two cards in the 640 column; 390: a scroller). */
function BenefitsLucky({locale,bias,signedOut}:{locale:AppLocale;bias:SelectedBias;signedOut:boolean}){
 const allFailed=Boolean(useContext(SectionContext)?.allFailed),{guest}=useStanNumbers(bias,signedOut);
 return <div className={styles.pLucky} hidden={allFailed}><StanLucky locale={locale} bias={bias} guest={guest}/></div>;
}
/** F2: the cheer card heads the right column from 1024px (390: under the lucky draws). */
function BenefitsCheer({locale,bias,signedOut}:{locale:AppLocale;bias:SelectedBias;signedOut:boolean}){
 const allFailed=Boolean(useContext(SectionContext)?.allFailed),{guest,hearts}=useStanNumbers(bias,signedOut);
 return <div className={styles.pCheer} hidden={allFailed}><StanCheer locale={locale} bias={bias} guest={guest} hearts={typeof hearts==='number'?hearts:null}/></div>;
}
/** 오늘의 덕질: one tile/row per joined fan page; guests see the spotlight pages with a login check-in (same outline). Hidden while the policy is off; the skeleton holds the height until both are known. Its first check-in is the emphasised action while the exchange is not usable. */
function BenefitsToday({locale,emphasise}:{locale:AppLocale;emphasise:boolean}){
 const auth=useGroupRequest(),status=useDukjilStatus(locale),w=walletCopy(locale),title=dukjilText(locale,'dukjilTodayTitle'),hidden=auth.ready&&status==='off';
 const [today,setToday]=useState<{failed:boolean;retry:()=>void}>({failed:false,retry:()=>{}}),onFailure=(failed:boolean,retry:()=>void)=>setToday({failed,retry});
 const lifted=useSectionFailure('today',today.failed&&!hidden,()=>today.retry());
 if(hidden)return null;
 const explore={label:groupsCopy(locale).explore,href:`/pages/groups?locale=${locale}`};
 return <div className={styles.pToday} hidden={lifted}>{!auth.ready||status==='loading'?<AttendanceSkeleton title={title} label={w.loading}/>:auth.authenticated?<MyAttendanceList key={auth.ownerKey} locale={locale} section={{title,moreLabel:seeAllLabel[locale],lessLabel:lessLabel(locale),limit:TODAY_ROWS,emptyAction:explore,emphasise,streakBand:true,onFailure}}/>:<DukjilProvider locale={locale}><GuestAttendanceList locale={locale} title={title} loginHref={fanLoginHref(locale,`/benefits?locale=${locale}`)} guideHref={`/guide/dukjil?locale=${locale}`} emptyAction={explore} onFailure={onFailure}/></DukjilProvider>}</div>;
}
/** 오늘의 미션: every catalog activity for the viewer's first joined fan page; its rows lead to that page. Guests and viewers without a page see the same list and go to the login or the page directory. */
function BenefitsDailyMissions({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),status=useDukjilStatus(locale),bias=useSelectedBias(locale),joined=useGroupResource(auth.authenticated?'/api/groups?mine=joined&limit=50':null,parseJoined),[attendance,setAttendance]=useState(false),allFailed=Boolean(useContext(SectionContext)?.allFailed);
 if(status==='off')return null;
 // Hold the section's place, at the height the loaded section takes (no jump below), until the policy, the favorite and the joined pages are known, so it does not appear late and push the page (V12).
 if(status==='loading'||!auth.ready||(auth.authenticated&&(joined.loading||bias.status==='loading')))return <section className={`${styles.pMissions} ${styles.missionsPending}`} hidden={allFailed} aria-busy='true' data-missions-pending=''><FanHeading>{dukjilText(locale,'missionsTitle')}</FanHeading><FanSkeletonRows rows={5}/></section>;
 if(status!=='on')return null;
 // H6: the rows lead to the favorite chosen in the header (its passport first), then a followed creator, then the first joined creator page.
 const first=(joined.data?.items??[]).find(item=>item.celebrityId&&item.slug),chosen=bias.selected??bias.unverified;
 const page=chosen?{slug:chosen.slug,name:chosen.name}:first?{slug:first.slug,name:first.name}:null,slug=page?.slug??'',title=dukjilText(locale,'missionsTitle'),directory=`/pages/groups?locale=${locale}`;
 return <div className={styles.pMissions} hidden={allFailed}><DukjilProvider key={slug} slug={slug||undefined} accountToday={!slug} locale={locale}><FanMissions all locale={locale} slug={slug} title={title} passportHref={`/passports?locale=${locale}`} proofHref={`/${slug}?tab=certifications&locale=${locale}`} noPage={slug?undefined:directory} onAttendance={()=>setAttendance(true)}/>{attendance&&page&&<CreatorAttendanceEntry slug={slug} pageName={page.name} locale={locale} reviewHref={`/c/${encodeURIComponent(slug)}/verify?locale=${locale}`} onClose={()=>setAttendance(false)}/>}</DukjilProvider></div>;
}
/** The last three history rows (1024+: the right column under the cheer card); its failure joins the section failures. */
function BenefitsHistory({locale}:{locale:AppLocale}){
 const [state,setState]=useState<{failed:boolean;retry:()=>void}>({failed:false,retry:()=>{}}),onFailure=(failed:boolean,retry:()=>void)=>setState({failed,retry});
 const lifted=useSectionFailure('history',state.failed,()=>state.retry());
 return <div className={styles.pHistoryWrap} id='stan-history' tabIndex={-1} hidden={lifted}><WalletHistoryPanel className={styles.pHistory} locale={locale} preview={{rows:HISTORY_ROWS,moreLabel:seeAllLabel[locale],lessLabel:lessLabel(locale),onFailure}}/></div>;
}
/** Guests: the history heading with the lock the other locked values use, over three fixed grey rows in the same card outline; drawn in the first HTML when the server saw no session. */
function BenefitsGuestHistory({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale);
 return <div className={styles.pGuestHistory} id='stan-history' tabIndex={-1}><section className={styles.pGuestHistorySection} aria-label={c.historyLink}><div className={styles.guestHistoryHead}><FanHeading>{c.historyLink}</FanHeading><FanLockedValue locale={locale}/></div><div className={styles.guestHistoryCard}><FanLockedRows rows={3}/></div></section></div>;
}
/** The wallet column's first piece: the shared wallet card. Guests keep the card and balances with the login action in the exchange slot. */
function BenefitsWallet({locale,signedOut=false,bias}:{locale:AppLocale;signedOut?:boolean;bias:SelectedBias}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 const {guest,stamps,hearts,passportId}=useStanNumbers(bias,signedOut),favorite=guest?null:stanFavorite(bias),slug=favorite?.slug??null;
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 const sections=useContext(SectionContext),retryAll=()=>window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT)),failed=auth.ready&&auth.authenticated&&!wallet.loading&&!wallet.data,allFailed=useSectionFailure('wallet',failed,retryAll),lifted=useLiftedAlert('wallet',{message:w.error,label:w.retry,retry:retryAll},failed&&!allFailed),walletAlert=lifted?null:<FanState inline kind='error' className={styles.inlineError} title={w.error} actions={<FanAction onClick={retryAll}>{w.retry}</FanAction>}/>;
 if(allFailed)return <div className={styles.pWallet}><FanState inline compact kind='error' title={w.error} actions={<FanAction variant='text' onClick={()=>sections?.retryAll()}>{w.retry}</FanAction>}/></div>;
 const card=(state:Parameters<typeof WalletCard>[0]['state'])=><StanWallet className={styles.pWallet} locale={locale} state={state} stamps={stamps} hearts={hearts} links={{hearts:slug?`/${encodeURIComponent(slug)}?tab=fans&locale=${locale}`:`/passports?locale=${locale}`,claim:passportId?`/passports/${encodeURIComponent(passportId)}?locale=${locale}#mission-book`:undefined}}/>;
 // The server saw no session: the signed-out card is drawn from the first HTML instead of a loading card of another height.
 if(!auth.ready&&signedOut||auth.ready&&!auth.authenticated)return card({kind:'guest',action:<FanAction variant='primary' fullWidth href={fanLoginHref(locale,`/benefits?locale=${locale}`)}>{w.login}</FanAction>});
 if(!auth.ready||wallet.loading)return card({kind:'loading'});
 if(!wallet.data)return lifted?card({kind:'failed'}):<>{walletAlert}</>;
 return card({kind:'ready',points:wallet.data.points,tickets:wallet.data.tickets,pointCost:wallet.data.pointCost});
}
/** Keeps a prepared 덕질 section visible but not usable until its operation is announced. */
type AlertEntry={message:string;label:string;retry:()=>void};
type AlertRegistry={register:(id:string,entry:AlertEntry)=>()=>void};
const AlertContext=createContext<AlertRegistry|null>(null);
type SoonSignal={report:(kind:'fail'|'content',delta:number)=>void};
const SoonContext=createContext<SoonSignal|null>(null);
const AlertEntriesContext=createContext<Record<string,AlertEntry>>({});
/** Tells the blurred wrapper that a section holds received content, which stays visible under the notice. */
function useSoonContent(active:boolean){
 const report=useContext(SoonContext)?.report;
 useEffect(()=>{if(!active)return;report?.('content',1);return()=>report?.('content',-1);},[report,active]);
}
/** Registers a failure with the screen-level list; returns true when the list shows it instead of the caller. */
function useLiftedAlert(id:string,entry:AlertEntry,enabled:boolean){
 const registry=useContext(AlertContext),retryRef=useRef(entry.retry),{message,label}=entry;
 retryRef.current=entry.retry;
 const lifted=enabled&&!!registry;
 useEffect(()=>{if(!lifted)return;return registry.register(id,{message,label,retry:()=>retryRef.current()});},[registry,lifted,id,message,label]);
 return lifted;
}
function SoonAlert({id,message,retryLabel,onRetry,blocking=true}:{id:string;message:string;retryLabel:string;onRetry:()=>void;blocking?:boolean}){
 const report=useContext(SoonContext)?.report,lifted=useLiftedAlert(id,{message,label:retryLabel,retry:onRetry},blocking);
 useEffect(()=>{if(!lifted)return;report?.('fail',1);return()=>report?.('fail',-1);},[report,lifted]);
 return lifted?<span hidden data-lifted-alert=''/>:<FanState inline kind='error' className={styles.inlineError} title={message} actions={<FanAction onClick={onRetry}>{retryLabel}</FanAction>}/>;
}
/** Collects failures from every benefits section so the screen shows one alert per distinct message. */
function BenefitsAlerts({children}:{children:ReactNode}){
 const [entries,setEntries]=useState<Record<string,AlertEntry>>({});
 const registry=useRef<AlertRegistry>({register:(id,entry)=>{setEntries(current=>({...current,[id]:entry}));return()=>setEntries(current=>{const {[id]:_removed,...rest}=current;return rest;});}}).current;
 return <AlertContext.Provider value={registry}><AlertEntriesContext.Provider value={entries}>{children}</AlertEntriesContext.Provider></AlertContext.Provider>;
}
/** One alert per distinct message; its retry calls every failed request that shares the message. */
function BenefitsAlertList(){
 const entries=useContext(AlertEntriesContext),groups=new Map<string,AlertEntry[]>();
 for(const entry of Object.values(entries))groups.set(entry.message,[...(groups.get(entry.message)??[]),entry]);
 if(groups.size===0)return null;
 return <div className={styles.alertList}>{[...groups].map(([message,list])=><FanState inline key={message} kind='error' className={styles.inlineError} title={message} actions={<FanAction onClick={()=>list.forEach(entry=>entry.retry())}>{list[0].label}</FanAction>}/>)}</div>;
}
export function BenefitsComingSoon({locale,children,grouped}:{locale:AppLocale;children:ReactNode;grouped?:boolean}){
 const [counts,setCounts]=useState({fail:0,content:0}),report=useRef<SoonSignal['report']>((kind,delta)=>setCounts(current=>({...current,[kind]:Math.max(0,current[kind]+delta)}))).current,failed=counts.fail>0&&counts.content===0;
 const outer=useContext(AlertContext),block=<SoonContext.Provider value={{report}}><div className={grouped?`${styles.soon} ${styles.soonGroup}`:styles.soon} data-failed={failed?'':undefined}><div className={styles.soonContent} inert aria-hidden='true'>{children}</div>{!failed&&<p className={styles.soonNotice}>{groupBenefitsCopy(locale).soon}</p>}</div></SoonContext.Provider>;
 return outer?block:<BenefitsAlerts><BenefitsAlertList/>{block}</BenefitsAlerts>;
}

function BenefitsSkeleton({kind,label}:{kind:'wallet'|'event'|'support';label:string}){
 return <div role='status' aria-label={label} aria-busy='true' className={`${styles.loadingSkeleton} ${styles[`loading_${kind}`]}`}><div aria-hidden='true'>{(kind==='wallet'?[0,1,2]:kind==='event'?[0]:[0,1]).map(item=><div key={item}><i/><span><i/><i/></span></div>)}</div></div>;
}
/** Summary used by the local preview: the same balance cells as the wallet card. */
export function BenefitsSummary({locale,points,tickets,locked=false}:{locale:AppLocale;points?:string;tickets?:string;locked?:boolean}){
 const slot=(value?:string)=>locked?'locked' as const:value&&/\d/.test(value)?Number(value.replace(/\D/g,'')):'missing' as const;
 return <WalletBalances locale={locale} points={slot(points)} tickets={slot(tickets)}/>;
}
export function BenefitsCatalog({kind,locale,heading}:{kind:'raffles';locale:AppLocale;heading?:string}){
 const c=groupBenefitsCopy(locale),t=groupsCopy(locale),r=raffleCopy(locale),w=walletCopy(locale);
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<Array<GroupBenefitsCatalog['items'][number]>>([]);
 const resource=useGroupResource<GroupBenefitsCatalog>(`/api/groups/benefits?kind=${kind}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,parseRaffles);
 const items=[...new Map([...previous,...(resource.data?.items??[])].map(item=>[item.id,item])).values()];
 const more=resource.data?.nextCursor?<FanAction variant='text' className={styles.linkChip} onClick={()=>{setPrevious(items);setCursor(resource.data!.nextCursor!);}}>{t.more}</FanAction>:null;
 useSoonContent(items.length>0);
 const retry=()=>{if(cursor&&resource.failure?.code==='GROUP_BENEFITS_NOT_FOUND'){setPrevious([]);setCursor(undefined);resource.retry();}else resource.retry();};
 return <section className={styles.section} aria-label={kind==='raffles'?c.lucky:c.events}>
 {(heading||more)&&<div className={styles.sectionHead}>{heading&&<FanHeading>{heading}</FanHeading>}{more}</div>}
 <div className={kind==='raffles'?styles.raffleCards:styles.events}>
 {kind==='raffles'&&<Link className={styles.raffleCard} href={`/my/capsules?locale=${locale}` as Route}><img src='/images/groups/capsule-closed.png' alt='' width={80} height={80}/><strong>{capsuleCopy(locale).title}</strong><span>{w.tickets}</span><ChevronRight aria-hidden='true'/></Link>}
 {items.map(item=><Link className={kind==='raffles'?styles.raffleCard:styles.event} href={`${item.href}?locale=${locale}` as Route} key={`${kind}:${item.id}`}>
 {item.imageUrl?<GroupImage className={styles.eventImage} src={item.imageUrl} locale={locale} alt='' width={80} height={60}/>:<Ticket aria-hidden='true'/>}
 <span className={styles.raffleTitle}><small className={styles.eventType}>{kind==='raffles'?c.lucky:c.events} · {item.pageName}</small><strong>{item.title}</strong></span><span className={styles.raffleDetails}>{item.description&&<small>{item.description}</small>}{'rewardPoints' in item&&<small>{w.points} {item.rewardPoints.toLocaleString(locale)} P</small>}{'closesAt' in item&&<small>{benefitsRaffleState(locale,item.status)} · {locale==='ko'?'마감':r.deadline} <time dateTime={item.closesAt}>{new Date(item.closesAt).toLocaleString(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</time></small>}</span><ChevronRight aria-hidden='true'/></Link>)}
 </div>
 {resource.loading&&(items.length?<p role='status'>{t.loading}</p>:<BenefitsSkeleton kind='event' label={t.loading}/>)}
 {resource.error&&<SoonAlert id='catalog' message={w.error} retryLabel={t.retry} onRetry={retry} blocking={items.length===0}/>}
 {resource.data&&!items.length&&<FanState inline kind='empty' title={c.empty}/>}
 </section>;
}
