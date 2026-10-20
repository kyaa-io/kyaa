"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Pause, Play, X, ArrowRight, Minus, Plus } from "lucide-react";
import { useByUsSession } from "@/components/byus-session-provider";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { earningStatusSchema, walletSchema } from "@/server/mobile-fan-economy/domain";
import { useSupportOperation } from "@/features/support/use-support-operation";
import { creatorRafflesHref } from "@/features/benefit/domain/raffle-navigation";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { communityRewardsCopy } from "@/i18n/catalogs/features__community-rewards";
import { type AppLocale } from "@/i18n/locales";
import styles from "./community-rewards.module.css";
const parseEarning=(v:unknown)=>earningStatusSchema.parse(v);
const parseWallet=(v:unknown)=>walletSchema.parse(v);
export function CommunityRewards({creator,locale}:{creator:PublishedCelebrity;locale:AppLocale}) {
 const auth=usePrivy(),session=useByUsSession();const t=communityRewardsCopy(locale),s=supportCopy(locale);
 const ready=auth.ready&&session.ready;
 const earning=useOwnedFanResource(`/api/me/mobile-fan-economy/earning-status?celebritySlug=${encodeURIComponent(creator.slug)}`,parseEarning,auth);
 const labels={comment:t.comment,reaction:t.reaction,verification:t.verification,certification:t.certification,share:t.share,live_reservation:t.reservation};
 return <section className={styles.earning} aria-label={t.heading}><h2>{t.heading}</h2><ul>{Object.entries(labels).map(([key,label])=>{const action=ready&&auth.authenticated&&earning.state.status==="ready"&&!earning.refreshFailed?earning.state.data.actions.find(item=>item.key===key):null;return <li key={key}><div><span>{label}</span><strong>{!ready?s.loading:!auth.authenticated?s.login:earning.state.status==="error"||earning.refreshFailed?s.error:earning.state.status==="loading"?"…":!action?t.preparing:action.status==="disabled"||action.status==="not_eligible"?t.unavailable:`+${action.pointAmount.toLocaleString(locale)}P`}</strong></div>{action&&<small>{action.status==="daily_limit"?t.dailyLimit:action.status==="lifetime_limit"?t.lifetimeLimit:action.dailyLimit!==null?`${action.usedToday}/${action.dailyLimit}`:action.lifetimeLimit!==null?`${action.lifetimeUsed}/${action.lifetimeLimit}`:""}</small>}</li>;})}</ul><p>{t.sharedLimit}</p><FanAction variant="text" href={`/fandom?creator=${encodeURIComponent(creator.slug)}&locale=${locale}`} trailingIcon={<ArrowRight/>}>{t.missions}</FanAction>{(earning.state.status==="error"||earning.refreshFailed)&&ready&&auth.authenticated&&<FanAction variant="text" onClick={earning.retry}>{s.retry}</FanAction>}</section>;
}
type WalletResource = ReturnType<typeof useOwnedFanResource<ReturnType<typeof parseWallet>>>;
export function CommunityLucky({creator,locale,children,sidebar}:{creator:PublishedCelebrity;locale:AppLocale;children?:ReactNode;sidebar?:ReactNode}) {
 const t=communityRewardsCopy(locale),s=supportCopy(locale);
 const [open,setOpen]=useState(false),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(true);
 const id=useId(),video=useRef<HTMLVideoElement>(null);
 const auth=usePrivy(),session=useByUsSession();
 const ready=auth.ready&&session.ready;
 const owner=ready&&auth.authenticated?session.ownerId??auth.user?.id??null:null;
 const wallet=useOwnedFanResource(`/api/me/mobile-fan-economy/wallet?celebritySlug=${encodeURIComponent(creator.slug)}`,parseWallet,auth);
 const exchanged=()=>{
  wallet.invalidate();
  if(owner)notifyFanActivityUpdated(owner);
 };
 const data=owner&&wallet.state.status==="ready"&&!wallet.refreshFailed?wallet.state.data:null;
 const balance=data?`${data.fanPoints.toLocaleString(locale)} P · ${data.freeDrawEntries.toLocaleString(locale)} ${t.lucky}`:!ready?s.loading:!owner?s.login:wallet.state.status==="error"||wallet.refreshFailed?s.error:s.loading;
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 useEffect(()=>{const player=video.current;if(!player)return;if(paused||reduced){player.pause();}else{void player.play().catch(()=>setPaused(true));}},[paused,reduced]);
 return <>
  <div className={styles.mobileWallet} data-testid="community-wallet"><strong>{balance}</strong><FanAction onClick={()=>setOpen(true)}>{t.exchange}</FanAction></div>
  <div className={styles.layout}>
   <div className={styles.mainColumn}>{children}</div>
   <aside className={styles.sidebar}>
    <section className={styles.lucky} aria-label={s.lucky}>
     <h2>{s.lucky}</h2><p>{t.drawIntro}</p>
     <div className={styles.artwork}><video ref={video} src={reduced?undefined:"/images/lotto/mix.mp4"} poster="/images/lotto/mix.png" width={1024} height={1024} muted loop playsInline preload="none" aria-hidden="true"/></div>
     <p className={styles.balance}>{balance}</p>
     <FanAction variant="primary" fullWidth onClick={()=>setOpen(true)} ariaLabel={`KYAA LUCKY DRAW · ${t.exchange}`}>{t.exchange}</FanAction>
     <FanAction fullWidth href={creatorRafflesHref(creator.slug,locale)}>{t.draws}</FanAction>
     <button className={styles.pause} disabled={reduced} type="button" onClick={()=>setPaused(!paused)} aria-label={paused||reduced?t.play:t.pause}>{paused||reduced?<Play size={16} aria-hidden="true"/>:<Pause size={16} aria-hidden="true"/>}<span>{paused||reduced?t.play:t.pause}</span></button>
    </section>
    {sidebar}
   </aside>
  </div>
  <Dialog open={open} onClose={()=>setOpen(false)} labelledBy={id} backdropClassName={styles.backdrop} contentClassName={styles.dialog}>
   <header className={styles.dialogHeader}><h2 id={id}>{t.exchange}</h2><button type="button" onClick={()=>setOpen(false)} aria-label={t.close}><X aria-hidden="true"/></button></header>
   {open&&(!ready?<p role="status">{s.loading}</p>:owner?<LuckyExchange key={`${owner}:${session.generation}:${creator.slug}`} creator={creator} locale={locale} owner={owner} wallet={wallet} onComplete={exchanged} onClose={()=>setOpen(false)}/>:<div className={styles.exchange}><p>{t.guest}</p><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/community?creator=${creator.slug}&locale=${locale}`)}`}>{s.login}</FanAction></div>)}
  </Dialog>
 </>;
}
function LuckyExchange({creator,locale,owner,wallet,onComplete,onClose}:{creator:PublishedCelebrity;locale:AppLocale;owner:string;wallet:WalletResource;onComplete:()=>void;onClose:()=>void}) {
 const auth=usePrivy(),s=supportCopy(locale),t=communityRewardsCopy(locale),quantityId=useId();
 const operation=useSupportOperation(owner,creator.slug,auth.getAccessToken,onComplete,"free_draw");
 const [units,setUnits]=useState(1),[confirm,setConfirm]=useState(false);
 const data=wallet.state.status==="ready"&&!wallet.refreshFailed?wallet.state.data:null;
 const policy=data?.policy,cost=policy?.status==="configured"?policy.freeDrawPointCost:null;
 const max=data&&policy?.status==="configured"&&cost?Math.min(Math.floor(data.fanPoints/cost),policy.maxUnits,policy.dailyRemaining??Infinity):0;
 const valid=Number.isSafeInteger(units)&&units>=1&&units<=max;
 const blocked=operation.busy||!!operation.pending||operation.error;
 const changeUnits=(value:number)=>{setUnits(value);setConfirm(false);};
 return <section className={styles.exchange}>
  <p>{creator.name} · {s.points}{data?` ${data.fanPoints.toLocaleString(locale)} P`:""}</p>
  {!data&&<p role="status">{wallet.refreshFailed?s.error:wallet.state.status==="loading"?s.loading:s.error}</p>}
  {wallet.state.status==="error"||wallet.refreshFailed?<FanAction onClick={wallet.retry}>{s.retry}</FanAction>:!cost&&data?<p role="status">{t.preparing}</p>:null}
  {cost&&<p className={styles.rate}>{cost.toLocaleString(locale)} P → 1 {t.lucky}</p>}
  <p className={styles.unitHelp}>{t.luckyUnit}</p>
  <label htmlFor={quantityId}>{s.units}</label>
  <div className={styles.stepper}>
   <button type="button" aria-label={t.decrease} disabled={blocked||!valid||units<=1} onClick={()=>changeUnits(units-1)}><Minus size={18} aria-hidden="true"/></button>
   <input id={quantityId} type="number" min={1} max={max} step={1} value={Number.isNaN(units)?"":units} disabled={blocked||!max} onChange={event=>changeUnits(event.target.valueAsNumber)}/>
   <button type="button" aria-label={t.increase} disabled={blocked||!valid||units>=max} onClick={()=>changeUnits(units+1)}><Plus size={18} aria-hidden="true"/></button>
  </div>
  {valid&&cost&&data&&<dl className={styles.preview}><div><dt>{s.cost}</dt><dd>−{(units*cost).toLocaleString(locale)} P</dd></div><div><dt>{s.remaining}</dt><dd>{(data.fanPoints-units*cost).toLocaleString(locale)} P · {data.freeDrawEntries+units} {t.lucky}</dd></div></dl>}
  {!!cost&&data&&!max&&<p role="status">{policy?.status==="configured"&&policy.dailyRemaining===0?t.dailyLimit:t.insufficient}</p>}
  <p className={styles.unitHelp}>{t.exchangeNote}</p>
  {confirm&&valid&&cost&&data?<div className={styles.confirmation} role="status"><FanAction fullWidth variant="primary" disabled={blocked} onClick={()=>{setConfirm(false);if(policy?.status==="configured")void operation.submit("exchange",policy.version,units);}}>{s.confirm}</FanAction><FanAction fullWidth onClick={()=>setConfirm(false)}>{t.back}</FanAction></div>:<><FanAction fullWidth variant="primary" disabled={blocked||!valid} onClick={()=>setConfirm(true)}>{t.exchange}</FanAction><FanAction fullWidth onClick={onClose}>{t.cancel}</FanAction></>}
  {operation.pending?<div role="status"><p>{s.uncertain}</p><p>{operation.pending.input.units} {t.lucky}</p><div className={styles.actions}><FanAction disabled={operation.busy} onClick={operation.reconcile}>{s.retry}</FanAction><FanAction disabled={operation.busy} onClick={operation.retry}>{t.exchange}</FanAction><FanAction disabled={operation.busy} onClick={operation.cancel}>{s.cancel}</FanAction></div></div>:operation.error?<p role="alert">{s.error}</p>:operation.complete?<p role="status">{s.complete}</p>:null}
 </section>;
}
