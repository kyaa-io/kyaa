"use client";
import {WalletHistoryPanel} from '@/features/group-wallet/ui/wallet-screen';
import {WalletBalances,WalletCard,WalletExchange,WalletStrip} from '@/features/group-wallet/ui/wallet-card';
import {useSelectedBias,type SelectedBiasOption} from '@/features/selected-bias/ui/use-selected-bias';
import {FanHelpTip} from '@/components/fan-ui/fan-help-tip';
import {fanUiText} from '@/components/fan-ui/fan-ui-copy';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Route} from 'next';
import {ArrowRight,ChevronRight,Heart,Ticket} from 'lucide-react';
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
import {FanTag} from '@/components/fan-ui/fan-tag';
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
import styles from './group-benefits.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const parseRaffles=(value:unknown)=>groupBenefitsCatalogSchema.options[0].parse(value);
const TODAY_ROWS=5,HISTORY_ROWS=5,HISTORY_ROWS_WIDE=3,LUCKY_CARDS=2;
const parseJoined=(value:unknown)=>groupListSchema.parse(value);
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
/** U4: the exchange is a secondary action and the one emphasised action is the check-in row of the missions, so the wallet no longer moves the emphasis. */
const ignoreAffordable=()=>{};
export function GroupBenefitsScreen({locale,initialHeart=null,signedOut=false}:{locale:AppLocale;initialHeart?:SelectedBiasOption|null;signedOut?:boolean}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale);
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main'><FanContentContainer as='main' id='benefits-main' className={styles.page}>
 <header className={styles.srOnly}><FanHeading as='h1'>{c.title}</FanHeading></header>
 <BenefitsAlerts><BenefitsSections><BenefitsAlertList/>
 <div className={styles.top}><BenefitsWallet key={`${locale}:${auth.ownerKey}`} locale={locale} signedOut={signedOut} onAffordableChange={ignoreAffordable}/></div>
 <div className={styles.firstRow}><BenefitsLucky locale={locale}/><BenefitsHeart locale={locale} initial={initialHeart} signedOut={signedOut}/></div>
 <div className={styles.main}><BenefitsDailyMissions locale={locale}/><BenefitsToday locale={locale} emphasise={false}/></div>
 <BenefitsSide>{auth.ready?(auth.authenticated?<BenefitsHistory locale={locale}/>:<BenefitsGuestHistory locale={locale}/>):signedOut&&<BenefitsGuestHistory locale={locale}/>}</BenefitsSide></BenefitsSections></BenefitsAlerts>
 </FanContentContainer></FanAppFrame>;
}
/** 럭키드로우 is not open yet: the section keeps its cards and their 응모하기 buttons, disabled, with the 준비 중 reason behind a help tip. No raffle is read. */
function BenefitsLucky({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale),allFailed=Boolean(useContext(SectionContext)?.allFailed),preparing=benefitsRaffleState(locale,'preparing');
 return <section className={styles.pLucky} aria-label={c.lucky} hidden={allFailed} data-lucky-soon><div className={styles.sectionHead}><FanHeading>{c.lucky}</FanHeading><FanHelpTip label={preparing} title={c.lucky} closeLabel={fanUiText(locale,'close')}>{preparing}</FanHelpTip></div>
 <ul className={styles.luckyCards}>{Array.from({length:LUCKY_CARDS},(_,index)=><li className={styles.luckyCard} key={index}><span className={styles.luckyImage}><img src='/images/economy/ticket.svg' alt='' width={40} height={40} data-fallback=''/></span><span className={styles.luckyText}><strong>{c.lucky} {index+1}</strong></span><FanTag tone='neutral' className={styles.luckyState}>{preparing}</FanTag></li>)}</ul></section>;
}
/** 하트 응원: the viewer's favorite (헤더의 최애) with one link to its page, where hearts and the like are sent. Without a favorite: pick one; guests: log in. */
function BenefitsHeart({locale,initial,signedOut}:{locale:AppLocale;initial:SelectedBiasOption|null;signedOut:boolean}){
 // While the browser signs in, the favorite the server read for this request draws the card (same markup as the loaded one), so it is in the first HTML.
 const live=useSelectedBias(locale),bias=live.status==='loading'&&initial?{...live,status:'ready' as const,selected:initial}:live.status==='loading'&&signedOut?{...live,status:'guest' as const}:live,t=(key:Parameters<typeof dukjilText>[1],values?:unknown[])=>dukjilText(locale,key,values),title=t('heartTitle');
 const target=bias.selected??bias.unverified,href=target?`/${encodeURIComponent(target.slug)}?locale=${locale}`:`/pages/groups?locale=${locale}`;
 const body=bias.status==='loading'?<div className={styles.heartPending}><FanSkeletonRows rows={1}/></div>
  :bias.status==='guest'?<Link className={styles.heartLink} href={fanLoginHref(locale,`/benefits?locale=${locale}`) as Route}><span className={styles.heartIcon}><Heart aria-hidden='true' size={20}/></span><span className={styles.heartName}>{t('heartPick')}</span><ArrowRight aria-hidden='true' size={16}/></Link>
  :<Link className={styles.heartLink} href={href as Route}>{bias.selected?<img className={styles.heartAvatar} src={bias.selected.image} alt='' width={40} height={40} style={bias.selected.imagePosition?{objectPosition:bias.selected.imagePosition}:undefined}/>:<span className={styles.heartIcon}><Heart aria-hidden='true' size={20}/></span>}<span className={styles.heartName}>{target?t('heartGo',[target.name]):t('heartPick')}</span><ArrowRight aria-hidden='true' size={16}/></Link>;
 return <section className={styles.pHeart} aria-label={title}><div className={styles.sectionHead}><FanHeading>{title}</FanHeading></div>{body}</section>;
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
/** Last history rows inside the wallet column; its failure joins the section failures. */
function BenefitsHistory({locale}:{locale:AppLocale}){
 const [state,setState]=useState<{failed:boolean;retry:()=>void}>({failed:false,retry:()=>{}}),onFailure=(failed:boolean,retry:()=>void)=>setState({failed,retry});
 const lifted=useSectionFailure('history',state.failed,()=>state.retry());
 return <div className={styles.pHistoryWrap} hidden={lifted}><WalletHistoryPanel className={styles.pHistory} locale={locale} preview={{rows:HISTORY_ROWS,wideRows:HISTORY_ROWS_WIDE,moreLabel:seeAllLabel[locale],lessLabel:lessLabel(locale),onFailure}}/></div>;
}
/** Guests: the history heading with the lock the other locked values use, over fixed grey rows, from 1024px; drawn in the first HTML when the server saw no session; below that the section is not drawn so public values come first. */
function BenefitsGuestHistory({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale);
 return <div className={styles.pGuestHistory}><section className={styles.pGuestHistorySection} aria-label={c.historyLink}><div className={styles.guestHistoryHead}><h2 className={styles.guestHistoryTitle}>{c.historyLink}</h2><FanLockedValue locale={locale}/></div><FanLockedRows rows={3}/></section></div>;
}
/** The wallet column's first piece: the shared wallet card. Guests keep the card and balances with the login action in the exchange slot. */
function BenefitsWallet({locale,signedOut=false,onAffordableChange}:{locale:AppLocale;signedOut?:boolean;onAffordableChange:(canExchange:boolean|null)=>void}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 const sections=useContext(SectionContext),retryAll=()=>window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT)),failed=auth.ready&&auth.authenticated&&!wallet.loading&&!wallet.data,allFailed=useSectionFailure('wallet',failed,retryAll),lifted=useLiftedAlert('wallet',{message:w.error,label:w.retry,retry:retryAll},failed&&!allFailed),walletAlert=lifted?null:<FanState inline kind='error' className={styles.inlineError} title={w.error} actions={<FanAction onClick={retryAll}>{w.retry}</FanAction>}/>;
 const known=auth.ready&&auth.authenticated&&!wallet.loading,canExchange=known?Boolean(wallet.data&&wallet.data.points>=wallet.data.pointCost):null;
 useEffect(()=>{onAffordableChange(canExchange);},[canExchange,onAffordableChange]);
 if(allFailed)return <div className={styles.pWallet}><FanState inline compact kind='error' title={w.error} actions={<FanAction variant='text' onClick={()=>sections?.retryAll()}>{w.retry}</FanAction>}/></div>;
 const card=(state:Parameters<typeof WalletCard>[0]['state'])=><WalletStrip className={styles.pWallet} locale={locale} title={w.wallet} state={state}/>;
 // The server saw no session: the signed-out card is drawn from the first HTML instead of a loading card of another height.
 if(!auth.ready&&signedOut||auth.ready&&!auth.authenticated)return card({kind:'guest',action:<FanAction variant='primary' fullWidth href={fanLoginHref(locale,`/benefits?locale=${locale}`)}>{w.login}</FanAction>});
 if(!auth.ready||wallet.loading)return card({kind:'loading'});
 if(!wallet.data)return lifted?card({kind:'failed'}):<>{walletAlert}</>;
 return card({kind:'ready',points:wallet.data.points,tickets:wallet.data.tickets,pointCost:wallet.data.pointCost});
}
export function BenefitsExchangeShop({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 if(!auth.ready||!auth.authenticated||wallet.loading||wallet.error||!wallet.data)return null;
 return <WalletExchange locale={locale} pointCost={wallet.data.pointCost} affordable={wallet.data.points>=wallet.data.pointCost}/>;
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
