"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { supportWalletSchema, supportHistorySchema } from "@/server/mobile-fan-economy/domain";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { AppLocale } from "@/i18n/locales";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { LuckyPanel } from "@/features/lucky/ui/lucky-panel";
import { CreatorBalance } from "./creator-balance";
import { SUPPORT_HEADERS, useSupportOperation } from "./use-support-operation";
import styles from "./support-screen.module.css";
export type SupportCreator=Pick<PublishedCelebrity,"slug"|"name"|"image">;
const parseWallet=(v:unknown)=>supportWalletSchema.parse(v);
const parseHistory=(v:unknown)=>supportHistorySchema.parse(v);
export function SupportScreen({locale,creators,directoryFailed=false,initialCreator,luckyContent}:{locale:AppLocale;creators:readonly SupportCreator[];directoryFailed?:boolean;initialCreator?:string;luckyContent?:(creator:SupportCreator)=>ReactNode}) {
 const t=supportCopy(locale); const auth=usePrivy(); const session=useByUsSession();
 const [slug,setSlug]=useState(initialCreator ?? creators[0]?.slug ?? ""); const [tab,setTab]=useState<"hearts"|"lucky"|"history">("hearts");
 const creator=creators.find(c=>c.slug===slug) ?? creators[0];
 const owner=auth.authenticated&&session.ready&&auth.ready ? session.ownerId ?? auth.user?.id ?? null:null;
 return <FanAppFrame locale={locale} mainId="support-content" currentPath="/support"><FanContentContainer as="main" id="support-content" className={styles.main} tabIndex={-1}><header className={styles.heading}><h1>{t.title}</h1><p>{t.rate}</p></header><nav className={styles.tabs} aria-label={t.title}>{(["hearts","lucky","history"] as const).map(value=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>setTab(value)}>{t[value]}</button>)}</nav>
 {directoryFailed?<FanState kind="error" title={t.error} actions={<FanAction href={`/support?locale=${locale}`}>{t.retry}</FanAction>}/>:!creator?<FanState kind="empty" title={t.empty}/>:<><label className={styles.selector}>{t.creator}<select value={creator.slug} onChange={e=>{setSlug(e.target.value);const url=new URL(window.location.href);url.searchParams.set("creator",e.target.value);window.history.replaceState(null,"",url);}}>{creators.map(c=><option value={c.slug} key={c.slug}>{c.name}</option>)}</select></label><div className={styles.creator}><CreatorAvatar slug={creator.slug} src={creator.image.url} photos={creator.image.photos} position={creator.image.position} size={64}/><h2>{creator.name}</h2></div>
 {tab==="lucky" ? luckyContent?.(creator) ?? <LuckyPanel locale={locale} creator={creator}/> : !auth.ready||!session.ready?<FanState kind="loading" title={t.loading}/>:!owner?<FanState kind="auth" title={t.guest} actions={<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/support?locale=${locale}&creator=${creator.slug}`)}`} variant="primary">{t.login}</FanAction>}/>:<OwnedSupport key={`${owner}:${session.generation}:${creator.slug}`} owner={owner} creator={creator} locale={locale} tab={tab}/>}
 </>}
 </FanContentContainer></FanAppFrame>;
}
function OwnedSupport({owner,creator,locale,tab}:{owner:string;creator:SupportCreator;locale:AppLocale;tab:"hearts"|"history"}) {
 const auth=usePrivy();const t=supportCopy(locale);const query=`?celebritySlug=${encodeURIComponent(creator.slug)}`;
 const wallet=useOwnedFanResource(`/api/me/mobile-fan-economy/wallet${query}`,parseWallet,auth,undefined,SUPPORT_HEADERS);
 const history=useOwnedFanResource(`/api/me/mobile-fan-economy/history${query}`,parseHistory,auth,undefined,SUPPORT_HEADERS);
 const operation=useSupportOperation(owner,creator.slug,auth.getAccessToken,()=>notifyFanActivityUpdated(owner));
 const [units,setUnits]=useState(1);const [exchangeUnits,setExchangeUnits]=useState(1);const [confirmation,setConfirmation]=useState<"support"|"exchange"|null>(null);
 const confirmationRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(confirmation) confirmationRef.current?.focus();},[confirmation]);
 const operationFeedback = operation.pending?<section className={styles.recovery} aria-live="polite"><p>{t.uncertain}</p><p>{operation.pending.operation==="exchange"?t.exchange:t.send} · {operation.pending.input.units} {t.hearts}</p><div className={styles.actions}><FanAction disabled={operation.busy} onClick={operation.reconcile}>{t.retry}</FanAction><FanAction disabled={operation.busy} onClick={operation.retry}>{operation.pending.operation==="exchange"?t.exchange:t.send}</FanAction><FanAction disabled={operation.busy} onClick={operation.cancel}>{t.cancel}</FanAction></div></section>:operation.error?<p role="alert">{t.error}</p>:operation.complete?<p role="status">{t.complete}</p>:null;
 if(tab==="history") return <div className={styles.stack}>{operationFeedback}{history.state.status==="ready" ? <section className={styles.panel}><h2>{t.history}</h2>{history.state.data.entries.length?<ul className={styles.history}>{history.state.data.entries.map(item=><li key={item.id}><span>{item.asset==="support_voucher"?t.hearts:item.asset==="fan_point"?t.points:t.lucky}</span><strong>{item.amount>0?"+":""}{item.amount.toLocaleString(locale)}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale)}</time></li>)}</ul>:<p>{t.noHistory}</p>}</section>:<FanState kind={history.state.status==="loading"?"loading":"error"} title={history.state.status==="loading"?t.loading:t.error} actions={history.state.status==="error"?<FanAction onClick={history.retry}>{t.retry}</FanAction>:undefined}/>}</div>;
 if(wallet.state.status!=="ready") return <div className={styles.stack}>{operationFeedback}<FanState kind={wallet.state.status==="loading"?"loading":"error"} title={wallet.state.status==="loading"?t.loading:t.error} actions={wallet.state.status==="error"?<FanAction onClick={wallet.retry}>{t.retry}</FanAction>:undefined}/></div>;
 const data=wallet.state.data;const policy=data.policy;const configured=policy.status==="configured"&&policy.supportVoucherPointCost===100&&policy.supportVoucherAmountKrw===100;
 const sendMax=policy.status==="configured"?Math.min(data.supportVouchers,policy.maxUnits):0;
 const exchangeMax=configured?Math.min(Math.floor(data.fanPoints/100),policy.maxUnits,policy.dailyRemaining??Infinity):0;
 const amount=confirmation==="exchange"?exchangeUnits:units;const max=confirmation==="exchange"?exchangeMax:sendMax;
 const valid=Number.isSafeInteger(amount)&&amount>=1&&amount<=max;
 const blocked=operation.busy||!!operation.pending;
 return <div className={styles.stack}><CreatorBalance compact slug={creator.slug} name={creator.name} locale={locale}/>
 {operationFeedback}
 {!configured?<FanState kind="empty" title={t.unconfigured}/>:null}
 <section className={`${styles.panel} ${styles.heartPanel}`}><div className={styles.balanceHeading}><h2>{t.hearts}</h2><strong className={styles.heartCount}>♡ {data.supportVouchers.toLocaleString(locale)}</strong></div><label className={styles.amount}>{t.send}<input type="number" min={1} max={sendMax} step={1} value={Number.isNaN(units)?"":units} onChange={e=>{setUnits(e.target.valueAsNumber);setConfirmation(null);}} disabled={blocked||!sendMax}/></label><p>{t.remaining}: {Number.isSafeInteger(units)&&units>=1&&units<=sendMax?data.supportVouchers-units:data.supportVouchers} {t.hearts}</p><FanAction fullWidth variant="primary" disabled={blocked||!configured||!Number.isSafeInteger(units)||units<1||units>sendMax} onClick={()=>setConfirmation("support")}>{t.send}</FanAction></section>
 <section className={styles.panel}><h2>{t.exchange}</h2><p>{t.points} <strong>{data.fanPoints.toLocaleString(locale)} P</strong></p><p>{t.rate}</p><label className={styles.amount}>{t.units}<input type="number" min={1} max={exchangeMax} step={1} value={Number.isNaN(exchangeUnits)?"":exchangeUnits} onChange={e=>{setExchangeUnits(e.target.valueAsNumber);setConfirmation(null);}} disabled={blocked||!exchangeMax}/></label><FanAction fullWidth disabled={blocked||!configured||!Number.isSafeInteger(exchangeUnits)||exchangeUnits<1||exchangeUnits>exchangeMax} onClick={()=>setConfirmation("exchange")}>{t.exchange}</FanAction></section>
 {confirmation&&!operation.pending?<section className={styles.confirmation} ref={confirmationRef} tabIndex={-1} aria-live="polite"><h2>{confirmation==="exchange"?t.exchange:t.send}</h2><p>{creator.name} · {amount} {t.hearts}</p><p>{t.cost}: {confirmation==="exchange"?`${amount*100} P`:`${amount} ${t.hearts}`}</p><p>{t.remaining}: {confirmation==="exchange"?`${data.fanPoints-amount*100} P`:`${data.supportVouchers-amount} ${t.hearts}`}</p><div className={styles.actions}><FanAction variant="primary" disabled={!valid||blocked||!configured} onClick={()=>{if(valid&&configured){void operation.submit(confirmation,policy.version,amount);setConfirmation(null);}}}>{t.confirm}</FanAction><FanAction onClick={()=>setConfirmation(null)}>{t.cancel}</FanAction></div></section>:null}
 </div>;
}
