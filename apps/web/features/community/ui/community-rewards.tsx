"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Pause, Play, X, ArrowRight } from "lucide-react";
import { useByUsSession } from "@/components/byus-session-provider";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { earningStatusSchema, walletSchema } from "@/server/mobile-fan-economy/domain";
import { useSupportOperation } from "@/features/support/use-support-operation";
import { LuckyPanel } from "@/features/lucky/ui/lucky-panel";
import { RaffleEntryPanel } from "@/features/benefit/ui/raffle-entry-panel";
import type { BenefitEntryResult } from "@/features/benefit/domain/benefit-entry";
import type { BenefitCatalogItem } from "@/features/benefit/domain/benefit";
import { benefitListResponseSchema } from "@/features/benefit/domain/benefit";
import { raffleStatus, type RaffleList } from "@/features/benefit/domain/raffle";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { communityRewardsCopy } from "@/i18n/catalogs/features__community-rewards";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "./community-rewards.module.css";
const parseEarning=(v:unknown)=>earningStatusSchema.parse(v);
const parseWallet=(v:unknown)=>walletSchema.parse(v);
const parseBenefits=(v:unknown)=>benefitListResponseSchema.parse(v);
export function CommunityRewards({creator,locale}:{creator:PublishedCelebrity;locale:AppLocale}) {
 const auth=usePrivy(),session=useByUsSession();const t=communityRewardsCopy(locale),s=supportCopy(locale);
 const ready=auth.ready&&session.ready;
 const earning=useOwnedFanResource(`/api/me/mobile-fan-economy/earning-status?celebritySlug=${encodeURIComponent(creator.slug)}`,parseEarning,auth);
 const labels={comment:t.comment,reaction:t.reaction,verification:t.verification,certification:t.certification,share:t.share,live_reservation:t.reservation};
 return <section className={styles.earning} aria-label={t.heading}><h2>{t.heading}</h2><ul>{Object.entries(labels).map(([key,label])=>{const action=ready&&auth.authenticated&&earning.state.status==="ready"&&!earning.refreshFailed?earning.state.data.actions.find(item=>item.key===key):null;return <li key={key}><span>{label}</span><strong>{!ready?s.loading:!auth.authenticated?s.login:earning.state.status==="error"||earning.refreshFailed?s.error:earning.state.status==="loading"?"…":!action?t.preparing:action.status==="disabled"||action.status==="not_eligible"?t.unavailable:`+${action.pointAmount.toLocaleString(locale)}P`}</strong>{action&&<small>{action.status==="daily_limit"?t.dailyLimit:action.status==="lifetime_limit"?t.lifetimeLimit:action.dailyLimit!==null?`${action.usedToday}/${action.dailyLimit}`:action.lifetimeLimit!==null?`${action.lifetimeUsed}/${action.lifetimeLimit}`:""}</small>}</li>;})}</ul><p>{t.sharedLimit}</p><FanAction variant="text" href={`/fandom?creator=${encodeURIComponent(creator.slug)}&locale=${locale}`} trailingIcon={<ArrowRight/>}>{t.missions}</FanAction>{(earning.state.status==="error"||earning.refreshFailed)&&ready&&auth.authenticated&&<FanAction variant="text" onClick={earning.retry}>{s.retry}</FanAction>}</section>;
}
export function CommunityLucky({creator,locale}:{creator:PublishedCelebrity;locale:AppLocale}) {
 const t=communityRewardsCopy(locale),s=supportCopy(locale);const [open,setOpen]=useState(false);const [paused,setPaused]=useState(false);const id=useId();const video=useRef<HTMLVideoElement>(null);const [reduced,setReduced]=useState(true);
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 useEffect(()=>{const player=video.current;if(!player)return;if(paused||reduced){player.pause();}else{void player.play().catch(()=>setPaused(true));}},[paused,reduced]);
 const auth=usePrivy(),session=useByUsSession();const owner=auth.ready&&auth.authenticated&&session.ready?session.ownerId??auth.user?.id??null:null;
 return <><section className={styles.lucky}><button className={styles.luckyOpen} type="button" onClick={()=>setOpen(true)} aria-haspopup="dialog"><video ref={video} src={reduced?undefined:"/images/lotto/mix.mp4"} poster="/images/lotto/mix.png" muted loop playsInline preload="none" aria-hidden="true"/><span>KYAA LUCKY DRAW</span><h2>{s.lucky}</h2><span>{t.exchange} <ArrowRight size={16} aria-hidden="true"/></span></button><button className={styles.pause} disabled={reduced} type="button" onClick={()=>setPaused(!paused)} aria-label={paused||reduced?t.play:t.pause}>{paused||reduced?<Play size={18}/>:<Pause size={18}/>}</button></section><Dialog open={open} onClose={()=>setOpen(false)} labelledBy={id} backdropClassName={styles.backdrop} contentClassName={styles.dialog}><header className={styles.dialogHeader}><h2 id={id}>{creator.name} · {s.lucky}</h2><button type="button" onClick={()=>setOpen(false)} aria-label={t.close}><X/></button></header>{open&&(!auth.ready||!session.ready?<p role="status">{s.loading}</p>:<LuckyContent key={`${owner}:${session.generation}:${creator.slug}`} creator={creator} locale={locale} owner={owner}/>)}</Dialog></>;
}
function LuckyContent({creator,locale,owner}:{creator:PublishedCelebrity;locale:AppLocale;owner:string|null}) {
 const t=communityRewardsCopy(locale),s=supportCopy(locale),auth=usePrivy();const [selected,setSelected]=useState<RaffleList["raffles"][number]|null>(null);
 const benefits=useOwnedFanResource(selected?`/api/benefits?celebrity=${encodeURIComponent(creator.slug)}&locale=${toContentLocale(locale)}`:null,parseBenefits,auth);
 const retryBenefits=benefits.retry;
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(!selected)return;
  const boundary=[selected.entryOpensAt,selected.entryClosesAt].filter((value):value is string=>!!value).map(Date.parse).filter(at=>at>now).sort((a,b)=>a-b)[0];
  if(!boundary)return;
  const timer=window.setTimeout(()=>{setNow(Date.now());retryBenefits();},Math.min(boundary-Date.now()+1,2_147_483_647));return()=>window.clearTimeout(timer);
 },[selected,now,retryBenefits]);
 const [totalsUnknown,setTotalsUnknown]=useState(false);
 const benefitData=benefits.state.status==="ready"?benefits.state.data:null;
 useEffect(()=>{setTotalsUnknown(false);},[benefitData]);
 const accepted=(result:BenefitEntryResult)=>{
  if(owner)notifyFanActivityUpdated(owner);
  if(result.replayed){setTotalsUnknown(true);benefits.retry();return;}
  if(benefitData)benefits.replaceData({benefits:benefitData.benefits.map(item=>!item.entry?item:{...item,entry:{...item.entry,creatorTicketBalance:result.resultingBalance,...(item.id===result.benefitId?{enteredTickets:result.benefitTicketTotal,remainingBenefitTickets:result.remainingBenefitTickets,perFanTicketLimit:result.perFanTicketLimit}:{})}})});
 };
 const reconciled=(fresh:BenefitCatalogItem)=>{
  if(owner)notifyFanActivityUpdated(owner);
  if(benefitData)benefits.replaceData({benefits:benefitData.benefits.map(item=>item.id===fresh.id?fresh:!item.entry||!fresh.entry?item:{...item,entry:{...item.entry,creatorTicketBalance:fresh.entry.creatorTicketBalance}})});
  else benefits.retry();
  setTotalsUnknown(false);
 };
 return <div className={styles.dialogBody}>{owner?<LuckyExchange creator={creator} locale={locale} owner={owner}/>:<div className={styles.exchange}><p>{t.guest}</p><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/community?creator=${creator.slug}&locale=${locale}`)}`}>{s.login}</FanAction></div>}{selected?<section><FanAction variant="text" onClick={()=>setSelected(null)}>{t.back}</FanAction><h3>{selected.title}</h3><p>{selected.summary}</p><RaffleEntryPanel key={selected.id} celebrity={creator} locale={locale} raffle={selected} benefit={benefits.state.status==="ready"&&!benefits.refreshFailed&&!totalsUnknown?benefits.state.data.benefits.find(item=>item.id===selected.benefitId)??null:null} loading={benefits.state.status==="loading"} loadFailed={benefits.state.status==="error"||benefits.refreshFailed||totalsUnknown} refresh={benefits.retry} onAccepted={accepted} onReconciled={reconciled} status={raffleStatus(selected,now)}/></section>:<LuckyPanel locale={locale} creator={creator} onSelectRaffle={setSelected}/>}</div>;
}
function LuckyExchange({creator,locale,owner}:{creator:PublishedCelebrity;locale:AppLocale;owner:string}) {
 const auth=usePrivy(),s=supportCopy(locale),t=communityRewardsCopy(locale);
 const wallet=useOwnedFanResource(`/api/me/mobile-fan-economy/wallet?celebritySlug=${encodeURIComponent(creator.slug)}`,parseWallet,auth);
 const operation=useSupportOperation(owner,creator.slug,auth.getAccessToken,()=>notifyFanActivityUpdated(owner),"free_draw");
 const [units,setUnits]=useState(1),[confirm,setConfirm]=useState(false);
 const data=wallet.state.status==="ready"&&!wallet.refreshFailed?wallet.state.data:null;const policy=data?.policy;const cost=policy?.status==="configured"?policy.freeDrawPointCost:null;
 const max=data&&policy?.status==="configured"&&cost?Math.min(Math.floor(data.fanPoints/cost),policy.maxUnits,policy.dailyRemaining??Infinity):0;
 const valid=Number.isSafeInteger(units)&&units>=1&&units<=max;const blocked=operation.busy||!!operation.pending||operation.error;
 return <section className={styles.exchange}><h3>{t.exchange}</h3><p>{t.luckyUnit}</p>{data?<p>{s.points}: <strong>{data.fanPoints.toLocaleString(locale)}P</strong> · {t.lucky}: <strong>{data.freeDrawEntries.toLocaleString(locale)}</strong></p>:<p role="status">{wallet.state.status==="loading"?s.loading:s.error}</p>}{wallet.state.status==="error"||wallet.refreshFailed?<FanAction onClick={wallet.retry}>{s.retry}</FanAction>:!cost&&data?<p>{t.preparing}</p>:null}{cost&&<p>{cost.toLocaleString(locale)}P → 1 {t.lucky}</p>}<label>{s.units}<input type="number" min={1} max={max} step={1} value={Number.isNaN(units)?"":units} disabled={blocked||!max} onChange={event=>{setUnits(event.target.valueAsNumber);setConfirm(false);}}/></label>{confirm&&valid&&cost&&data?<div className={styles.confirmation} role="status"><p>{s.cost}: −{(units*cost).toLocaleString(locale)}P · +{units} {t.lucky}</p><p>{s.remaining}: {(data.fanPoints-units*cost).toLocaleString(locale)}P · {data.freeDrawEntries+units} {t.lucky}</p><FanAction disabled={blocked} onClick={()=>{setConfirm(false);if(policy?.status==="configured")void operation.submit("exchange",policy.version,units);}}>{s.confirm}</FanAction><FanAction variant="text" onClick={()=>setConfirm(false)}>{t.back}</FanAction></div>:<FanAction disabled={blocked||!valid} onClick={()=>setConfirm(true)}>{t.exchange}</FanAction>}{operation.pending?<div role="status"><p>{s.uncertain}</p><p>{operation.pending.input.units} {t.lucky}</p><div className={styles.actions}><FanAction disabled={operation.busy} onClick={operation.reconcile}>{s.retry}</FanAction><FanAction disabled={operation.busy} onClick={operation.retry}>{t.exchange}</FanAction><FanAction disabled={operation.busy} onClick={operation.cancel}>{s.cancel}</FanAction></div></div>:operation.error?<p role="alert">{s.error}</p>:operation.complete?<p role="status">{s.complete}</p>:null}</section>;
}
