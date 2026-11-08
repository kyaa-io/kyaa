"use client";
import {StanWallet,type StanSlot} from '@/features/group-wallet/ui/stan-wallet';
import {StanHistoryCard,StanHistoryTab} from '@/features/group-wallet/ui/stan-history';
import {WalletExchangeDialog} from '@/features/group-wallet/ui/wallet-screen';
import type {WalletCardState} from '@/features/group-wallet/ui/wallet-card';
import {openingPage} from '@/features/passport/ui/passport-mission-book';
import {passportRoadmapSchema} from '@/features/passport/domain/dukjil-types';
import {useSelectedBias,type SelectedBias,type SelectedBiasOption} from '@/features/selected-bias/ui/use-selected-bias';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {FanAppFrame,FanContentContainer} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanTabs} from '@/components/fan-ui/fan-tabs';
import {FanMissions} from '@/features/dukjil/ui/fan-missions';
import {CreatorAttendanceEntry} from '@/features/dukjil/ui/creator-attendance-entry';
import {groupListSchema} from '@/features/groups/domain/contracts';
import {DukjilProvider,useDukjilStatus} from '@/features/dukjil/ui/dukjil-provider';
import {dukjilText} from '@/features/dukjil/ui/dukjil-copy';
import {FanHeading} from '@/components/fan-ui/fan-heading';
import {FanState} from '@/components/fan-ui/fan-state';
import {fanLoginHref} from '@/components/login-href';
import {type AppLocale} from '@/i18n/locales';
import {walletSchema} from '@/server/group-wallet/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {LuckyDrawModule,useLuckyOpen} from '@/features/lucky-draw/ui/lucky-draw-module';
import {GROUP_WALLET_CHANGED_EVENT,useGroupRequest,useGroupResource} from './use-group-resource';
import {FanSkeletonRows} from '@/components/fan-ui/fan-skeleton';
import {groupBenefitsCopy} from './group-benefits-copy';
import {StanCheer,stanFavorite} from './stan-lucky-cheer';
import type {StanTab} from './stan-tab';
import styles from './group-benefits-screen.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const parseJoined=(value:unknown)=>groupListSchema.parse(value);
const parseRoadmap=(value:unknown)=>passportRoadmapSchema.parse(value);
const tabHref=(locale:AppLocale,tab:StanTab)=>tab==='today'?`/benefits?locale=${locale}`:`/benefits?tab=${tab}&locale=${locale}`;
/** The favorite of this screen: while the browser signs in, the favorite the server read for this request (so the first HTML has it); a request the server saw signed out is a guest at once. */
function useStanBias(locale:AppLocale,initial:SelectedBiasOption|null,signedOut:boolean):SelectedBias{
 const live=useSelectedBias(locale);
 return live.status==='loading'&&initial?{...live,status:'ready',selected:initial}:live.status==='loading'&&signedOut?{...live,status:'guest'}:live;
}
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
/** True for a viewer the screen draws signed out: the server saw no session, or the browser finished and found none. */
function useGuest(signedOut:boolean,bias?:SelectedBias){
 const auth=useGroupRequest();
 return (!auth.ready&&signedOut)||(auth.ready&&!auth.authenticated)||bias?.status==='guest';
}
/** 덕질 (plan-ux r5.1 3.2 · 4-B): secondary tabs 오늘 · 내역 (sticky under the header), the canvas in --color-soft and a 1,100 container.
 * 오늘: body 733 (잔액 카드 → 오늘 할 것 → 럭키드로우) + aside 343 (최애 응원 → 내역); 390 one column in that order. 내역: one column, 720. 오늘의 덕질 is gone (8장 plan ①). */
export function GroupBenefitsScreen({locale,initialHeart=null,signedOut=false,tab:initialTab='today'}:{locale:AppLocale;initialHeart?:SelectedBiasOption|null;signedOut?:boolean;tab?:StanTab}){
 const c=groupBenefitsCopy(locale),bias=useStanBias(locale,initialHeart,signedOut);
 // The body follows the pressed tab at once (no wait for the route); the address follows through the link, and a route change (back) brings the tab back.
 const [tab,setTab]=useState<StanTab>(initialTab);
 useEffect(()=>{setTab(initialTab);},[initialTab]);
 const go=(next:StanTab)=>()=>setTab(next);
 const h1=<header className={styles.srOnly}><FanHeading as='h1'>{c.title}</FanHeading></header>;
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main' className={styles.frame}>
 <FanContentContainer className={styles.subnav}><FanTabs variant='underline' label={c.title} current={tab} items={[{key:'today',label:dukjilText(locale,'stanTabToday'),href:tabHref(locale,'today'),onSelect:go('today')},{key:'history',label:dukjilText(locale,'stanTabHistory'),href:tabHref(locale,'history'),onSelect:go('history')}]}/></FanContentContainer>
 {tab==='history'?<HistoryTab locale={locale} signedOut={signedOut} bias={bias} heading={h1}/>:<TodayTab locale={locale} signedOut={signedOut} bias={bias} onHistory={go('history')} heading={h1}/>}
 </FanAppFrame>;
}
function HistoryTab({locale,signedOut,bias,heading}:{locale:AppLocale;signedOut:boolean;bias:SelectedBias;heading:ReactNode}){
 const auth=useGroupRequest(),guest=useGuest(signedOut,bias);
 return <FanContentContainer as='main' id='benefits-main' className={styles.page} data-stan-tab='history'>{heading}<StanHistoryTab key={auth.ownerKey} locale={locale} guest={guest}/></FanContentContainer>;
}
/** 오늘: main is the two-column grid itself (main > column > [data-block]): body wallet · list · lucky, aside 최애 응원 · 내역. */
function TodayTab({locale,signedOut,bias,onHistory,heading}:{locale:AppLocale;signedOut:boolean;bias:SelectedBias;onHistory:()=>void;heading:ReactNode}){
 const auth=useGroupRequest(),guest=useGuest(signedOut,bias),[exchange,setExchange]=useState(false),openExchange=()=>setExchange(true);
 return <BenefitsSections><FanContentContainer as='main' id='benefits-main' className={`${styles.page} ${styles.grid}`} data-stan-tab='today' data-layout='two-col'>
  <div className={styles.column}>
   {heading}
   <div className={styles.slot} data-block='wallet'><BenefitsWallet key={`${locale}:${auth.ownerKey}`} locale={locale} signedOut={signedOut} bias={bias} onExchange={openExchange} onHistory={onHistory}/></div>
   <BenefitsDailyMissions locale={locale}/>
   <BenefitsLucky locale={locale} bias={bias} guest={guest} onExchange={openExchange}/>
  </div>
  <aside className={styles.column}>
   <BenefitsCheer locale={locale} bias={bias} signedOut={signedOut}/>
   {(auth.ready||signedOut)&&<BenefitsHistory key={auth.ownerKey} locale={locale} guest={guest} onHistory={onHistory}/>}
  </aside>
 </FanContentContainer>{!guest&&<WalletExchangeDialog locale={locale} open={exchange} onClose={()=>setExchange(false)}/>}</BenefitsSections>;
}
/** The numbers the wallet and the cheer card share (C9): stamps are the stamped slots of the passport page being filled (the MY card's number), hearts come with the summary. */
function useStanNumbers(bias:SelectedBias,signedOut:boolean){
 const auth=useGroupRequest(),guest=useGuest(signedOut,bias);
 const passportId=auth.authenticated?bias.selected?.passportId:undefined,roadmap=useGroupResource(passportId?`/api/me/passports/${encodeURIComponent(passportId)}/roadmap`:null,parseRoadmap);
 const page=roadmap.data?roadmap.data.pages[openingPage(roadmap.data.pages)]:undefined;
 // A favorite without a passport has no stamped page yet: 0/9, not a skeleton that never ends.
 const stamps:StanSlot=guest?'locked':!bias.selected?(bias.status==='loading'?'loading':0):!passportId&&auth.ready?0:page?page.filled:roadmap.data?0:roadmap.error?'missing':'loading';
 const hearts:StanSlot=guest?'locked':bias.status==='loading'?'loading':bias.selected?bias.selected.hearts??'missing':0;
 return {guest,stamps,hearts};
}
/** 럭키드로우 모듈: under the missions in the body (390: after the missions, before the cheer card). */
function BenefitsLucky({locale,bias,guest,onExchange}:{locale:AppLocale;bias:SelectedBias;guest:boolean;onExchange:()=>void}){
 const allFailed=Boolean(useContext(SectionContext)?.allFailed);
 return <div className={styles.slot} hidden={allFailed} data-block='lucky'><LuckyDrawModule locale={locale} bias={bias} guest={guest} onExchange={onExchange}/></div>;
}
/** 최애 응원: the aside's first card from 1024px (390: under the lucky draw). */
function BenefitsCheer({locale,bias,signedOut}:{locale:AppLocale;bias:SelectedBias;signedOut:boolean}){
 const allFailed=Boolean(useContext(SectionContext)?.allFailed),{guest,hearts}=useStanNumbers(bias,signedOut);
 return <div className={styles.slot} hidden={allFailed} data-block='aside-card'><StanCheer locale={locale} bias={bias} guest={guest} hearts={typeof hearts==='number'?hearts:null}/></div>;
}
/** 오늘 할 것: every catalog activity for the viewer's favorite (else the first joined creator page); its rows lead to that page. Guests and viewers without a page see the same list and go to the login or the page directory. */
function BenefitsDailyMissions({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),status=useDukjilStatus(locale),bias=useSelectedBias(locale),joined=useGroupResource(auth.authenticated?'/api/groups?mine=joined&limit=50':null,parseJoined),[attendance,setAttendance]=useState(false),allFailed=Boolean(useContext(SectionContext)?.allFailed);
 if(status==='off')return null;
 const title=dukjilText(locale,'stanTodayTitle');
 // Hold the section's place, at the height the loaded section takes (no jump below), until the policy, the favorite and the joined pages are known, so it does not appear late and push the page (V12).
 if(status==='loading'||!auth.ready||(auth.authenticated&&(joined.loading||bias.status==='loading')))return <section className={`${styles.slot} ${styles.missionsPending}`} hidden={allFailed} aria-busy='true' data-missions-pending='' data-block='list'><FanHeading>{title}</FanHeading><FanSkeletonRows rows={5}/></section>;
 if(status!=='on')return null;
 // H6: the rows lead to the favorite chosen in the header (its passport first), then a followed creator, then the first joined creator page.
 const first=(joined.data?.items??[]).find(item=>item.celebrityId&&item.slug),chosen=bias.selected??bias.unverified;
 const page=chosen?{slug:chosen.slug,name:chosen.name}:first?{slug:first.slug,name:first.name}:null,slug=page?.slug??'',directory=`/pages/groups?locale=${locale}`;
 return <div className={styles.slot} hidden={allFailed} data-block='list'><DukjilProvider key={slug} slug={slug||undefined} accountToday={!slug} locale={locale}><FanMissions all locale={locale} slug={slug} title={title} passportHref={`/passports?locale=${locale}`} proofHref={`/${slug}?tab=certifications&locale=${locale}`} noPage={slug?undefined:directory} onAttendance={()=>setAttendance(true)}/>{attendance&&page&&<CreatorAttendanceEntry slug={slug} pageName={page.name} locale={locale} reviewHref={`/c/${encodeURIComponent(slug)}/verify?locale=${locale}`} onClose={()=>setAttendance(false)}/>}</DukjilProvider></div>;
}
/** 내역 card (aside 2): the last three rows; its failure joins the section failures. */
function BenefitsHistory({locale,guest,onHistory}:{locale:AppLocale;guest:boolean;onHistory:()=>void}){
 const [state,setState]=useState<SectionState>({failed:false,retry:()=>{}}),onFailure=(failed:boolean,retry:()=>void)=>setState({failed,retry});
 const lifted=useSectionFailure('history',state.failed,()=>state.retry());
 return <div className={styles.slot} hidden={lifted} data-block='aside-card'><StanHistoryCard locale={locale} guest={guest} href={tabHref(locale,'history')} onAll={onHistory} onFailure={onFailure}/></div>;
}
/** 잔액 카드: guests keep the card with locked values and the login in the exchange slot; 교환 steps back to secondary while a lucky draw is open (plan ③). */
function BenefitsWallet({locale,signedOut=false,bias,onExchange,onHistory}:{locale:AppLocale;signedOut?:boolean;bias:SelectedBias;onExchange:()=>void;onHistory:()=>void}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 const {guest,stamps,hearts}=useStanNumbers(bias,signedOut),favorite=guest?null:stanFavorite(bias),slug=favorite?.slug??null,luckyOpen=useLuckyOpen(locale,slug);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 const sections=useContext(SectionContext),retryAll=()=>window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT)),failed=auth.ready&&auth.authenticated&&!wallet.loading&&!wallet.data,allFailed=useSectionFailure('wallet',failed,retryAll);
 if(allFailed)return <div><FanState inline compact kind='error' title={w.error} actions={<FanAction variant='text' onClick={()=>sections?.retryAll()}>{w.retry}</FanAction>}/></div>;
 const card=(state:WalletCardState)=><StanWallet locale={locale} state={state} stamps={stamps} hearts={hearts} exchangeSecondary={luckyOpen} onExchange={onExchange}
  links={{hearts:slug?`/${encodeURIComponent(slug)}?tab=fans&locale=${locale}`:`/passports?locale=${locale}`,tickets:`/my/raffles?locale=${locale}`,history:tabHref(locale,'history'),onHistory}}/>;
 // The server saw no session: the signed-out card is drawn from the first HTML instead of a loading card of another height.
 if(guest)return card({kind:'guest',action:<FanAction variant='primary' href={fanLoginHref(locale,`/benefits?locale=${locale}`)}>{w.login}</FanAction>});
 if(!auth.ready||wallet.loading)return card({kind:'loading'});
 if(!wallet.data)return card({kind:'failed',retry:retryAll});
 return card({kind:'ready',points:wallet.data.points,tickets:wallet.data.tickets,pointCost:wallet.data.pointCost});
}
