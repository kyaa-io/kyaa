"use client";
import {WalletExchangeDialog,WalletHistoryPanel} from '@/features/group-wallet/ui/wallet-screen';
import {HelpHint} from '@/features/group-wallet/ui/help-hint';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Route} from 'next';
import {ArrowRight,ChevronRight,Coins,Ticket} from 'lucide-react';
import {FanAppFrame,FanContentContainer} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {rankingsText} from '@/features/rankings/ui/rankings-copy';
import {AsOf,CreatorRankingList} from '@/features/rankings/ui/rankings-content';
import {useRankingResource} from '@/features/rankings/ui/use-ranking-resource';
import {creatorRankingSchema} from '@/features/rankings/domain/types';
import {MyAttendanceList,GuestAttendanceList,AttendanceSkeleton} from '@/features/dukjil/ui/my-attendance-list';
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
import {GROUP_WALLET_POINT_COST,walletSchema} from '@/server/group-wallet/domain';
import {walletCopy,walletHelpCopy,ticketSingular} from '@/features/group-wallet/ui/copy';
import {rewardedAdUnit} from '@/features/group-wallet/ui/google-rewarded-ad';
import {rewardedExchangeCopy} from '@/features/group-wallet/ui/rewarded-copy';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {GroupImage} from './group-image';
import {GROUP_WALLET_CHANGED_EVENT,useGroupRequest,useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {seeAllLabel} from './group-directory';
import {groupBenefitsCopy,benefitsRaffleState} from './group-benefits-copy';
import styles from './group-benefits.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const ticketLabel=(locale:AppLocale)=>locale==='ko'?'모임 응모권':walletCopy(locale).tickets;
const parseRaffles=(value:unknown)=>groupBenefitsCatalogSchema.options[0].parse(value);
const WEEK_RANKING_ROWS=5,TODAY_ROWS=5,HISTORY_ROWS=5,HISTORY_ROWS_WIDE=3;
const parseCreatorRanking=(value:unknown)=>creatorRankingSchema.parse(value);
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
/** Wallet column: a card, except while the combined failure alert stands in for it. */
function BenefitsSide({children}:{children:ReactNode}){
 const allFailed=Boolean(useContext(SectionContext)?.allFailed);
 return <div className={styles.side} data-card={allFailed?undefined:''}>{children}</div>;
}
export function GroupBenefitsScreen({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale),[canExchange,setCanExchange]=useState<boolean|null>(null);
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main'><FanContentContainer as='main' id='benefits-main' className={styles.page}>
 <header className={styles.srOnly}><FanHeading as='h1'>{c.title}</FanHeading></header>
 <BenefitsAlerts><BenefitsSections><BenefitsAlertList/>
 <div className={styles.main}><BenefitsToday locale={locale} emphasise={canExchange===false}/><BenefitsRanking locale={locale}/><BenefitsLucky locale={locale}/></div>
 <BenefitsSide><BenefitsWallet key={`${locale}:${auth.ownerKey}`} locale={locale} onAffordableChange={setCanExchange}/>
 {auth.ready&&(auth.authenticated?<BenefitsHistory locale={locale}/>:<BenefitsGuestHistory locale={locale}/>)}</BenefitsSide></BenefitsSections></BenefitsAlerts>
 </FanContentContainer></FanAppFrame>;
}
/** 럭키드로우 is not open yet: one outlined line like a today tile (name + status badge), no blurred preview (2026-11-06 decision). Hidden while the combined failure alert stands alone. */
function BenefitsLucky({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale),allFailed=Boolean(useContext(SectionContext)?.allFailed);
 return <section className={styles.pSoon} aria-label={c.lucky} hidden={allFailed}><h2 className={styles.luckyName}>{c.lucky}</h2><span className={styles.soonBadge}>{c.soon}</span></section>;
}
/** 오늘의 덕질: one tile/row per joined fan page; guests see the spotlight pages with a login check-in (same outline). Hidden while the policy is off; the skeleton holds the height until both are known. Its first check-in is the emphasised action while the exchange is not usable. */
function BenefitsToday({locale,emphasise}:{locale:AppLocale;emphasise:boolean}){
 const auth=useGroupRequest(),status=useDukjilStatus(locale),w=walletCopy(locale),title=dukjilText(locale,'dukjilTodayTitle'),hidden=auth.ready&&status==='off';
 const [today,setToday]=useState<{failed:boolean;retry:()=>void}>({failed:false,retry:()=>{}}),onFailure=(failed:boolean,retry:()=>void)=>setToday({failed,retry});
 const lifted=useSectionFailure('today',today.failed&&!hidden,()=>today.retry());
 if(hidden)return null;
 const explore={label:groupsCopy(locale).explore,href:`/pages/groups?locale=${locale}`};
 return <div className={styles.pToday} hidden={lifted}>{!auth.ready||status==='loading'?<AttendanceSkeleton title={title} label={w.loading}/>:auth.authenticated?<MyAttendanceList key={auth.ownerKey} locale={locale} section={{title,moreLabel:seeAllLabel[locale],lessLabel:lessLabel(locale),limit:TODAY_ROWS,emptyAction:explore,emphasise,onFailure}}/>:<DukjilProvider locale={locale}><GuestAttendanceList locale={locale} title={title} loginHref={fanLoginHref(locale,`/benefits?locale=${locale}`)} guideHref={`/guide/dukjil?locale=${locale}`} emptyAction={explore} onFailure={onFailure}/></DukjilProvider>}</div>;
}
/** Weekly creator heart ranking, top rows only; the full board with periods stays on /rankings. */
function BenefitsRanking({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),{state,retry}=useRankingResource(`/api/rankings/creators?period=week&locale=${locale}`,parseCreatorRanking),w=walletCopy(locale),title=rankingsText(locale,'rkTitle'),ready=state.status==='ready'?state.data:null;
 const lifted=useSectionFailure('ranking',state.status==='error',retry);
 return <section className={styles.pRank} aria-label={title} hidden={lifted}>
 <div className={styles.sectionHead}><FanHeading>{title}</FanHeading>{ready&&ready.rows.length>0&&<FanAction variant='text' trailingIcon={<ArrowRight size={16}/>} href={`/rankings?locale=${locale}`}>{seeAllLabel[locale]}</FanAction>}</div>
 {state.status==='loading'&&<div className={styles.rankSkeleton} role='status' aria-busy='true' aria-label={w.loading}><div aria-hidden='true'>{[0,1,2].map(item=><div key={item}><i/><span><i/><i/></span><i/></div>)}</div></div>}
 {state.status==='error'&&<FanState inline compact kind='error' title={rankingsText(locale,'rkError')} actions={<FanAction variant='text' onClick={retry}>{rankingsText(locale,'rkRetry')}</FanAction>}/>}
 {ready&&<><CreatorRankingList locale={locale} ranking={ready} limit={WEEK_RANKING_ROWS} embedded lockedMine={auth.ready&&!auth.authenticated}/>{ready.rows.length>0&&<AsOf locale={locale} computedAt={ready.computedAt}/>}</>}
 </section>;
}
/** Last history rows inside the wallet column; its failure joins the section failures. */
function BenefitsHistory({locale}:{locale:AppLocale}){
 const [state,setState]=useState<{failed:boolean;retry:()=>void}>({failed:false,retry:()=>{}}),onFailure=(failed:boolean,retry:()=>void)=>setState({failed,retry});
 const lifted=useSectionFailure('history',state.failed,()=>state.retry());
 return <div className={styles.pHistoryWrap} hidden={lifted}><WalletHistoryPanel className={styles.pHistory} locale={locale} preview={{rows:HISTORY_ROWS,wideRows:HISTORY_ROWS_WIDE,moreLabel:seeAllLabel[locale],lessLabel:lessLabel(locale),onFailure}}/></div>;
}
/** Guests: the history heading with fixed grey rows from 1024px; below that the section is not drawn so public values come first. */
function BenefitsGuestHistory({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale);
 return <div className={styles.pGuestHistory}><section className={styles.pGuestHistorySection} aria-label={c.historyLink}><h2 className={styles.guestHistoryTitle}>{c.historyLink}</h2><FanLockedRows rows={3}/></section></div>;
}
/** The wallet column's first piece: balances and the exchange rate/action in one card. Guests keep the card and balances with the login action in the exchange slot. */
function BenefitsWallet({locale,onAffordableChange}:{locale:AppLocale;onAffordableChange:(canExchange:boolean|null)=>void}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 const sections=useContext(SectionContext),retryAll=()=>window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT)),failed=auth.ready&&auth.authenticated&&!wallet.loading&&!wallet.data,allFailed=useSectionFailure('wallet',failed,retryAll),lifted=useLiftedAlert('wallet',{message:w.error,label:w.retry,retry:retryAll},failed&&!allFailed),walletAlert=lifted?null:<FanState inline kind='error' className={styles.inlineError} title={w.error} actions={<FanAction onClick={retryAll}>{w.retry}</FanAction>}/>;
 const known=auth.ready&&auth.authenticated&&!wallet.loading,canExchange=known?Boolean(wallet.data&&wallet.data.points>=wallet.data.pointCost):null;
 useEffect(()=>{onAffordableChange(canExchange);},[canExchange,onAffordableChange]);
 if(allFailed)return <div className={styles.pWallet}><FanState inline compact kind='error' title={w.error} actions={<FanAction variant='text' onClick={()=>sections?.retryAll()}>{w.retry}</FanAction>}/></div>;
 if(!auth.ready||wallet.loading)return <section className={styles.pWallet} aria-label={w.wallet}><div className={styles.walletSkeleton} role='status' aria-busy='true' aria-label={w.loading}><div aria-hidden='true'><div><i/><i/></div><div><i/><i/></div><div className={styles.walletSkeletonExchange}><i/><i/></div></div></div></section>;
 if(!auth.authenticated)return <section className={styles.pWallet} aria-label={w.wallet}><h2 className={styles.srOnly}>{w.wallet}</h2><BenefitsSummary locale={locale} locked/><div className={styles.exchange}><ExchangeRate locale={locale} pointCost={GROUP_WALLET_POINT_COST}/><FanAction variant='primary' fullWidth className={styles.walletAction} href={fanLoginHref(locale,`/benefits?locale=${locale}`)}>{w.login}</FanAction></div></section>;
 if(!wallet.data)return lifted?<section className={styles.pWallet} aria-label={w.wallet}><h2 className={styles.srOnly}>{w.wallet}</h2><BenefitsSummary locale={locale} points='— P' tickets='—'/></section>:<>{walletAlert}</>;
 const n=wallet.data;
 return <section className={styles.pWallet} aria-label={w.wallet}><h2 className={styles.srOnly}>{w.wallet}</h2><BenefitsSummary locale={locale} points={`${n.points.toLocaleString(locale)} P`} tickets={n.tickets.toLocaleString(locale)}/><BenefitsExchange locale={locale} pointCost={n.pointCost} affordable={n.points>=n.pointCost}/></section>;
}
/** Rate and the exchange action: enabled and emphasised only when the points cover the rate, otherwise the common disabled look (the rate line shows the condition). The exchange itself (ad, request key, recovery) runs in WalletExchangeDialog. */
function BenefitsExchange({locale,pointCost,affordable}:{locale:AppLocale;pointCost:number;affordable:boolean}){
 const [open,setOpen]=useState(false);
 return <div className={styles.exchange}><ExchangeRate locale={locale} pointCost={pointCost}/><FanAction variant='primary' fullWidth className={styles.walletAction} disabled={!affordable} onClick={()=>setOpen(true)}>{rewardedExchangeCopy(locale).action}</FanAction><WalletExchangeDialog locale={locale} open={open} onClose={()=>setOpen(false)}/></div>;
}
function ExchangeRate({locale,pointCost}:{locale:AppLocale;pointCost:number}){
 const w=walletCopy(locale);
 return <div className={styles.exchangeRate}><span>{pointCost.toLocaleString(locale)} P</span><ArrowRight size={18} aria-hidden/><span>{locale==='ko'?'1장':`1 ${ticketSingular[locale]??w.tickets}`}</span></div>;
}
export function BenefitsExchangeShop({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 if(!auth.ready||!auth.authenticated||wallet.loading||wallet.error||!wallet.data)return null;
 return <BenefitsExchange locale={locale} pointCost={wallet.data.pointCost} affordable={wallet.data.points>=wallet.data.pointCost}/>;
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
/** Presentational summary shared by the real screen and the local preview: two balances, label with a 24px icon, divided by a hairline. */
export function BenefitsSummary({locale,points,tickets,locked=false}:{locale:AppLocale;points?:string;tickets?:string;locked?:boolean}){
 const w=walletCopy(locale),h=walletHelpCopy(locale),unit=(value:string)=>locale==='ko'&&/\d/.test(value)?`${value}장`:value,pointsValue=points??'',ticketValue=unit(tickets??'');
 return <div className={styles.walletBalances}><div data-summary='points' className={styles.walletBalance}><span className={styles.walletBalanceLabel}><span className={styles.pointIcon} aria-hidden='true'><Coins size={16}/></span><span>{w.points}</span><HelpHint label={h.label} text={h.points}/></span>{locked?<strong><FanLockedValue locale={locale}/></strong>:<strong data-long={pointsValue.length>9?'':undefined}>{pointsValue}</strong>}</div><div className={styles.walletBalance}><span className={styles.walletBalanceLabel}><img src='/images/economy/ticket.svg' alt='' width={24} height={24}/><span>{ticketLabel(locale)}</span><HelpHint label={h.label} text={h.tickets}/></span>{locked?<strong><FanLockedValue locale={locale}/></strong>:<strong data-long={ticketValue.length>8?'':undefined}>{ticketValue}</strong>}</div></div>;
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
 <span className={styles.raffleTitle}><small className={styles.eventType}>{kind==='raffles'?c.lucky:c.events} · {item.pageName}</small><strong>{item.title}</strong></span><span className={styles.raffleDetails}>{item.description&&<small>{item.description}</small>}{'rewardPoints' in item&&<small>{w.points} {item.rewardPoints.toLocaleString(locale)} P</small>}{'closesAt' in item&&<small>{benefitsRaffleState(locale,item.status)} · {r.deadline} <time dateTime={item.closesAt}>{new Date(item.closesAt).toLocaleString(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</time></small>}</span><ChevronRight aria-hidden='true'/></Link>)}
 </div>
 {resource.loading&&(items.length?<p role='status'>{t.loading}</p>:<BenefitsSkeleton kind='event' label={t.loading}/>)}
 {resource.error&&<SoonAlert id='catalog' message={w.error} retryLabel={t.retry} onRetry={retry} blocking={items.length===0}/>}
 {resource.data&&!items.length&&<FanState inline kind='empty' title={c.empty}/>}
 </section>;
}
