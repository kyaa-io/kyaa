"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarCheck, Coins, Gift, Heart, Ticket, UsersRound } from "lucide-react";
import { z } from "zod";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useGroupResource, useGroupRequest, GroupRequestError } from "@/features/groups/ui/use-group-resource";
import { walletSchema, historySchema, requestSchema, exchangeSchema, checkInSchema, supportInputSchema, supportSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import { walletHistoryLabel } from "./history-label";
import { CommunityStampArtwork } from "@/features/community-stamps/ui/community-stamp-artwork";
import { groupsCopy } from "@/features/groups/ui/copy";
import { walletCopy, walletStartLabel, attendanceStreakLabel, heartSupportCopy } from "./copy";
import { groupDetailSchema } from "@/features/groups/domain/contracts";
import { GroupAvatar } from "@/features/groups/ui/group-shell";
import styles from "./wallet.module.css";
const parseWallet = (value: unknown) => walletSchema.parse(value);
const parseHistory = (value: unknown) => historySchema.parse(value);
const parseCreator=(value:unknown)=>groupDetailSchema.parse(value);
const pendingSchema = z.union([z.object({ operation: z.enum(["exchange", "check-in"]), requestKey: z.uuid(), target: z.enum(["heart", "ticket"]).optional(), units: z.number().int().min(1).max(1000).optional(), policyVersion: z.literal("group-wallet-v1").optional() }),supportInputSchema.extend({operation:z.literal("support")})]);
type Pending = z.infer<typeof pendingSchema>;
export function WalletScreen({ locale, attendance = false, supportCreator }: { locale: AppLocale; attendance?: boolean; supportCreator?:string }) {
 const auth = useGroupRequest(), c = walletCopy(locale),returnTo=`/my/wallet?locale=${locale}${supportCreator?`&view=support&creator=${encodeURIComponent(supportCreator)}`:attendance?"&view=attendance":""}`;
 return <FanAppFrame locale={locale} currentPath="/my" groupsEnabled mainId="wallet-main"><FanContentContainer as="main" id="wallet-main" tabIndex={-1} className={styles.page}><FanHeading as="h1" variant="personal-page">{supportCreator?heartSupportCopy(locale).title:attendance?c.attendance:c.wallet}</FanHeading>
 {!auth.ready ? <p role="status">{c.loading}</p> : !auth.authenticated ? <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction> : <OwnedWallet key={auth.ownerKey} locale={locale} attendance={attendance} supportCreator={supportCreator} />}
 </FanContentContainer></FanAppFrame>;
}
function OwnedWallet({ locale, attendance, supportCreator }: { locale: AppLocale; attendance: boolean; supportCreator?:string }) {
 const support=heartSupportCopy(locale),creator=useGroupResource(supportCreator?`/api/groups/resolve/${encodeURIComponent(supportCreator)}`:null,parseCreator),c = walletCopy(locale), wallet = useGroupResource("/api/me/wallet", parseWallet), history = useGroupResource("/api/me/wallet/history", parseHistory);
 const [target, setTarget] = useState<"heart" | "ticket">("heart"), [units, setUnits] = useState("1"), [pending, setPending] = useState<Pending | null>(null), [storageReady, setStorageReady] = useState(false), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState<"error" | "success" | null>(null);
 const [supportSent,setSupportSent]=useState<{slug:string;units:number}|null>(null);
 const running = useRef(false), alive = useRef(true); const storageKey = `kyaa-wallet-pending:${wallet.ownerKey.split(":").slice(0,-1).join(":")}`;
 useEffect(() => { alive.current = true; try { const stored = sessionStorage.getItem(storageKey); if (stored) setPending(pendingSchema.parse(JSON.parse(stored))); setStorageReady(true); } catch { setFeedback("error"); } return () => { alive.current = false; }; }, [storageKey]);
 function complete(input:Pending) { if(input.operation==="support")setSupportSent({slug:input.celebritySlug,units:input.units}); sessionStorage.removeItem(storageKey); setPending(null); setFeedback("success"); wallet.retry(); history.retry(); }
 async function submit(input: Pending, recover = false) {
  if (running.current || !storageReady) return;
  running.current = true; setBusy(true); setFeedback(null);setSupportSent(null);
  try {
   // Persist the original request before sending; a timeout never creates a new debit key.
   sessionStorage.setItem(storageKey, JSON.stringify(input)); setPending(input);
   if (recover) {
    const saved = requestSchema.parse(await wallet.request(`/api/me/wallet/requests/${input.requestKey}`));
    if (!alive.current) return;
    if (saved.status === "committed") { complete(input); return; }
    if (saved.status === "legacy") throw new Error("Original request context required");
   }
   const { operation, ...body } = input;
   const result = await wallet.request(`/api/me/wallet/${operation}`, { method: "POST", body: JSON.stringify(body) });
   if (!alive.current) return;
   if (operation === "exchange") exchangeSchema.parse(result); else if(operation === "support") supportSchema.parse(result); else checkInSchema.parse(result);
   complete(input);
  } catch (error) { if (alive.current) {
   if (error instanceof GroupRequestError && ["GROUP_WALLET_INVALID", "GROUP_WALLET_POLICY_CHANGED", "GROUP_WALLET_INSUFFICIENT_BALANCE", "GROUP_WALLET_REWARDS_NOT_STARTED", "GROUP_WALLET_TARGET_UNAVAILABLE"].includes(error.code)) { sessionStorage.removeItem(storageKey); setPending(null); wallet.retry(); }
   setFeedback("error");
  } }
  finally { running.current = false; if (alive.current) setBusy(false); }
 }
 if (wallet.loading) return <p role="status">{c.loading}</p>;
 if (!wallet.data) return <div role="alert"><p>{c.error}</p><FanAction onClick={wallet.retry}>{c.retry}</FanAction></div>;
 const data = wallet.data, rewardsPending=Boolean(data.rewardsStartOn&&data.attendance.date<data.rewardsStartOn), quantity = Number(units), valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000, cost = valid ? quantity * data.pointCost : 0, locked = busy || Boolean(pending) || data.writeFenced || !storageReady;
 return <div className={styles.shell}><div className={styles.layout}>
 {!attendance&&!supportCreator&&<dl className={styles.balances}>{([["points", Coins, data.points], ["hearts", Heart, data.hearts], ["tickets", Ticket, data.tickets]] as const).map(([key, Icon, value]) => <div key={key}><dt><Icon size={20} aria-hidden="true"/>{c[key]}</dt><dd>{value.toLocaleString(locale)}</dd></div>)}</dl>}
 {pending && <div className={styles.pending} role="status"><p>{c.pending}</p>{pending.operation==='support'&&<p>{support.title} · {pending.celebritySlug} · {pending.units.toLocaleString(locale)} {c.hearts}</p>}<FanAction disabled={busy} onClick={() => void submit(pending, true)}>{c.recover}</FanAction></div>}
 {feedback && <p role={feedback === "error" ? "alert" : "status"}>{feedback==='success'&&supportSent?`${support.sent.replace('{name}',creator.data?.page.slug===supportSent.slug?creator.data.page.name:supportSent.slug)} · ${supportSent.units.toLocaleString(locale)} ${c.hearts}`:c[feedback]}</p>}
 {supportCreator&&<section className={styles.panel}>{creator.data?.page.kind==='fan'&&creator.data.page.celebrityId&&creator.data.page.slug===supportCreator?<><header className={styles.supportIdentity}><GroupAvatar page={creator.data.page} locale={locale}/><h2>{creator.data.page.name}</h2></header><form onSubmit={event=>{event.preventDefault();if(valid&&quantity<=data.hearts&&!locked)void submit({operation:'support',requestKey:crypto.randomUUID(),policyVersion:data.policyVersion,celebritySlug:supportCreator,units:quantity});}}><fieldset disabled={locked}><dl className={styles.calculation}><div><dt>{c.hearts}</dt><dd>{data.hearts.toLocaleString(locale)}</dd></div></dl><label className={styles.quantity}>{support.quantity}<input type="number" min={1} max={Math.min(1000,data.hearts)} step={1} value={units} onChange={event=>setUnits(event.target.value)} required/></label><dl className={styles.calculation}><div><dt>{support.remaining}</dt><dd>{valid&&quantity<=data.hearts?(data.hearts-quantity).toLocaleString(locale):'—'}</dd></div></dl>{quantity>data.hearts&&<p role='status'>{support.insufficient}</p>}<FanAction className={styles.primary} type="submit" disabled={!valid||quantity>data.hearts} leadingIcon={<Heart/>}>{support.title}</FanAction><FanAction href={`/my/wallet?locale=${locale}`}>{c.exchange}</FanAction></fieldset></form></>:creator.loading?<p role="status">{c.loading}</p>:<div role="alert"><p>{c.error}</p><FanAction onClick={creator.retry}>{c.retry}</FanAction></div>}</section>}
 {attendance&&<section className={styles.attendance}><header className={styles.attendanceIntro}><div><h2>{attendanceStreakLabel(locale,data.attendance.streak)}</h2><strong>{data.attendance.checkedIn?c.checkedIn:c.checkIn.replace("10P",data.attendance.nextBonusIn===1?"30P":"10P")}</strong><p>{c.bonus}</p></div><CommunityStampArtwork kind="daily_checkin" locale={locale} size={96}/></header><ol className={styles.streak}>{Array.from({length:7},(_,index)=>{const completed=index<(data.attendance.checkedIn&&data.attendance.streak%7===0?7:data.attendance.streak%7);return <li key={index} data-complete={completed} data-bonus={index===6}><span>{index+1}</span>{completed?<CommunityStampArtwork kind="daily_checkin" locale={locale} size={64}/>:index===6?<Gift aria-hidden="true"/>:<CalendarCheck aria-hidden="true"/>}<strong>{index===6?'10P + 20P':'10P'}</strong></li>;})}</ol><FanAction className={styles.primary} disabled={locked || data.attendance.checkedIn || rewardsPending} onClick={() => void submit({ operation: "check-in", requestKey: crypto.randomUUID() })}>{rewardsPending ? walletStartLabel(locale,data.rewardsStartOn!) : data.attendance.checkedIn ? c.checkedIn : c.checkIn.replace("10P", data.attendance.nextBonusIn === 1 ? "30P" : "10P")}</FanAction><div className={styles.attendanceFacts}><div><CalendarCheck aria-hidden="true"/><strong>{c.checkIn}</strong></div><div><Gift aria-hidden="true"/><strong>{c.bonus}</strong></div></div></section>}
 {!attendance&&!supportCreator&&<section className={`${styles.panel} ${styles.exchange}`}><h2>{c.exchange}</h2><form onSubmit={event => { event.preventDefault(); if (valid && cost <= data.points && !locked) void submit({ operation: "exchange", requestKey: crypto.randomUUID(), policyVersion: data.policyVersion, target, units: quantity }); }}>
 <fieldset disabled={locked}><legend>{c.exchange}</legend><div className={styles.targets}>{(["heart", "ticket"] as const).map(value => <label key={value}><input type="radio" name="target" value={value} checked={target === value} onChange={() => setTarget(value)}/>{value === "heart" ? <Heart size={20} aria-hidden="true"/> : <Ticket size={20} aria-hidden="true"/>}{value === "heart" ? c.hearts : c.tickets}</label>)}</div><label className={styles.quantity}>{c.quantity}<input type="number" min={1} max={1000} step={1} value={units} onChange={event => setUnits(event.target.value)} required/></label><dl className={styles.calculation}><div><dt>{c.cost}</dt><dd>{valid ? `${cost.toLocaleString(locale)} P` : "—"}</dd></div><div><dt>{c.remaining}</dt><dd>{valid && cost <= data.points ? `${(data.points-cost).toLocaleString(locale)} P` : "—"}</dd></div></dl><FanAction className={styles.primary} type="submit" disabled={!valid || cost > data.points}>{c.exchange}</FanAction></fieldset></form></section>}
 {!attendance&&!supportCreator&&<section className={`${styles.panel} ${styles.history}`}><h2>{c.history}</h2>{history.loading ? <p role="status">{c.loading}</p> : history.error ? <FanAction onClick={history.retry}>{c.retry}</FanAction> : !history.data?.entries.length ? <p>{c.empty}</p> : <ul>{history.data.entries.map(entry => <li key={entry.id}><span>{entry.asset === "fan_point" ? <Coins aria-hidden="true" size={20}/> : entry.asset === "ticket" ? <Ticket aria-hidden="true" size={20}/> : <Heart aria-hidden="true" size={20}/>}<span>{walletHistoryLabel(locale,entry.sourceType)&&<span className={styles.historyReason}>{walletHistoryLabel(locale,entry.sourceType)}</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Seoul" })}</time></span></span><strong>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString(locale)} {entry.asset === "fan_point" ? "P" : entry.asset === "ticket" ? c.tickets : c.hearts}</strong></li>)}</ul>}</section>}
 </div><aside className={styles.aside}><h2><BookOpen aria-hidden="true"/>MY</h2><nav>{[{href:'/my',label:c.passport,Icon:BookOpen},{href:'/my/wallet?view=attendance',label:c.attendance,Icon:CalendarCheck},{href:'/pages/groups?mine=joined',label:groupsCopy(locale).joinedPages,Icon:UsersRound},{href:'/my/wallet',label:c.wallet,Icon:Coins}].map(item=><FanAction key={item.href} href={`${item.href}${item.href.includes('?')?'&':'?'}locale=${locale}`} leadingIcon={<item.Icon/>} aria-current={(attendance?item.href.includes('view=attendance'):item.href==='/my/wallet')?'page':undefined}>{item.label}</FanAction>)}</nav>{attendance&&<section><CommunityStampArtwork kind="daily_checkin" locale={locale} size={64}/><h3>{c.history}</h3><strong>{data.attendance.days.reduce((sum,day)=>sum+day.points,0)} P</strong><FanAction href={`/passports?locale=${locale}`}>{c.stamps}</FanAction></section>}</aside></div>;
}
