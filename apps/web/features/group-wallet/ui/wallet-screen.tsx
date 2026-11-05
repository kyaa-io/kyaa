"use client";
import {HistoryTabs} from '@/features/groups/ui/history-tabs';
import { useEffect, useRef, useState, useId } from "react";
import { BookOpen, CalendarCheck, Coins, Gift, Heart, Ticket, UsersRound, Stamp, Minus, Plus, WalletCards, CircleAlert, Clock3, Check } from "lucide-react";
import { z } from "zod";
import {useRouter} from "next/navigation";
import type {Route} from "next";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useGroupResource, useGroupRequest, GroupRequestError } from "@/features/groups/ui/use-group-resource";
import { walletSchema, historySchema, requestSchema, exchangeSchema, checkInSchema, supportInputSchema, supportSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import { walletHistoryLabel } from "./history-label";
import { loadRewardedGpt, requestRewardedAd, rewardedAdUnit, type RewardedAdState } from "./google-rewarded-ad";
import { rewardedExchangeCopy, rewardedSessionError } from "./rewarded-copy";
import { runRewardedSession } from "./rewarded-session";
import { GroupImage } from "@/features/groups/ui/group-image";
import { attendanceCopy, attendanceFirstStampLabel, attendanceRecordLabel, walletPendingTitle } from "./attendance-copy";
import { groupsCopy } from "@/features/groups/ui/copy";
import { walletCopy, walletStartLabel, attendanceStreakLabel, heartSupportCopy } from "./copy";
import { groupDetailSchema } from "@/features/groups/domain/contracts";
import { GroupAvatar } from "@/features/groups/ui/group-shell";
import { messages as closeMessages } from "@/i18n/catalogs/features__benefit__ui__benefit-screen";
import { translate } from "@/i18n/messages";
import styles from "./wallet.module.css";
import { PointRewardBurst, usePointRewardBurst } from "@/components/fan-ui/point-reward-burst";
import {SourceStatePanel} from "@/features/groups/ui/source-state-panel";
const parseWallet = (value: unknown) => walletSchema.parse(value);
const parseHistory = (value: unknown) => historySchema.parse(value);
const parseCreator=(value:unknown)=>groupDetailSchema.parse(value);
const pendingSchema = z.union([z.object({ operation: z.enum(["exchange", "check-in"]), requestKey: z.uuid(), target: z.enum(["heart", "ticket"]).optional(), units: z.number().int().min(1).max(1000).optional(), policyVersion: z.literal("group-wallet-v1").optional(), adSessionId: z.uuid().optional() }),supportInputSchema.extend({operation:z.literal("support")})]);
type Pending = z.infer<typeof pendingSchema>;
function WalletLoading({label,kind='wallet'}:{label:string;kind?:'wallet'|'support'|'history'|'attendance'}) {
 return <div className={`${styles.loadingSkeleton} ${styles[`loading_${kind}`]}`} role="status" aria-busy="true" aria-label={label}>{kind==='support'?<div aria-hidden="true"><header><i/><i/></header><div className={styles.loadingSupportForm}><i/><i/><i/><i/><i/></div></div>:<div aria-hidden="true"><i/><i/><i/><i/></div>}</div>;
}
export type WalletLocalPresentation={benefitsHref:string;historyRows?:{label:string;value:string}[]};
export function WalletScreen({ locale, attendance = false, supportCreator, localProfile, localPresentation }: { locale: AppLocale; attendance?: boolean; supportCreator?:string;localProfile?:{nickname:string;avatarUrl:string};localPresentation?:WalletLocalPresentation }) {
 const auth = useGroupRequest(), c = walletCopy(locale),returnTo=`/my/wallet?locale=${locale}${supportCreator?`&view=support&creator=${encodeURIComponent(supportCreator)}`:attendance?"&view=attendance":""}`;
 if(supportCreator)return <WalletSupportRoute locale={locale} creatorSlug={supportCreator}/>;
 if(attendance)return <WalletAttendanceRoute locale={locale}/>;
 return <FanAppFrame locale={locale} currentPath="/my" groupsEnabled mainId="wallet-main"><FanContentContainer as="main" id="wallet-main" tabIndex={-1} className={`${styles.page} ${attendance?styles.attendancePage:!supportCreator?styles.walletPage:""}`}><FanHeading as="h1" variant="personal-page">{attendance&&<Stamp className={styles.mobileHeadingIcon} aria-hidden="true"/>}{supportCreator?heartSupportCopy(locale).title:attendance?<> <span className={styles.desktopHeading}>My / {c.attendance}</span><span className={styles.mobileHeading}>{attendanceCopy(locale).stamps}</span></>:<>{localPresentation?<WalletCards className={styles.mobileHeadingIcon} aria-hidden="true"/>:<Coins className={styles.mobileHeadingIcon} aria-hidden="true"/>}<span className={styles.desktopHeading}>My / {c.wallet}</span><span className={styles.mobileHeading}>{c.wallet}</span></>}</FanHeading>
 {!auth.ready ? <WalletLoading label={c.loading} kind={attendance?"attendance":"wallet"}/> : !auth.authenticated ? <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction> : <OwnedWallet key={auth.ownerKey} locale={locale} attendance={attendance} supportCreator={supportCreator} localProfile={localProfile} localPresentation={localPresentation} />}
 </FanContentContainer></FanAppFrame>;
}
function WalletSupportRoute({locale,creatorSlug}:{locale:AppLocale;creatorSlug:string}) {
 const router=useRouter(),href=`/${encodeURIComponent(creatorSlug)}?locale=${locale}&tab=board`;
 return <FanAppFrame locale={locale} currentPath={href} groupsEnabled mainId="wallet-support-main"><FanContentContainer as="main" id="wallet-support-main" tabIndex={-1} className={styles.page}><div className={styles.srOnly}><FanHeading as="h1" variant="personal-page">{heartSupportCopy(locale).title}</FanHeading></div></FanContentContainer><WalletSupportDialog locale={locale} creatorSlug={creatorSlug} open onClose={()=>router.replace(href as Route)}/></FanAppFrame>;
}
function WalletAttendanceRoute({locale}:{locale:AppLocale}) {
 const router=useRouter(),href=`/my?locale=${locale}`;
 return <FanAppFrame locale={locale} currentPath="/my" groupsEnabled mainId="attendance-main"><FanContentContainer as="main" id="attendance-main" tabIndex={-1} className={styles.page}><div className={styles.srOnly}><FanHeading as="h1" variant="personal-page">{walletCopy(locale).attendance}</FanHeading></div></FanContentContainer><WalletAttendanceDialog locale={locale} open onClose={()=>router.replace(href as Route)}/></FanAppFrame>;
}
export function WalletAttendanceDialog({locale,open,onClose}:{locale:AppLocale;open:boolean;onClose:()=>void}) {
 const auth=useGroupRequest(),c=walletCopy(locale),titleId=useId(),returnTo=`/my/wallet?view=attendance&locale=${locale}`;
 return <Dialog open={open} onClose={onClose} labelledBy={titleId} backdropClassName={styles.supportBackdrop} contentClassName={`${styles.supportDialog} ${styles.attendanceDialog}`}>
  <header className={styles.supportDialogHeader}><h2 id={titleId}>{c.attendance}</h2><FanAction onClick={onClose}>{locale==='ko'?'닫기':translate(locale,closeMessages.m05a1db569ca0,'Close')}</FanAction></header>
  {!auth.ready?<WalletLoading label={c.loading} kind="attendance"/>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction>:open&&<OwnedWallet key={auth.ownerKey} locale={locale} attendance embedded/>}
 </Dialog>;
}
export function WalletExchangeDialog({locale,open,onClose}:{locale:AppLocale;open:boolean;onClose:()=>void}) {
 const auth=useGroupRequest(),c=walletCopy(locale),titleId=useId(),returnTo=`/benefits?locale=${locale}`;
 return <Dialog open={open} onClose={onClose} labelledBy={titleId} backdropClassName={styles.supportBackdrop} contentClassName={styles.supportDialog}>
  <header className={styles.supportDialogHeader}><h2 id={titleId}>{locale==='ko'?'모임 응모권 전환':c.exchange}</h2><FanAction onClick={onClose}>{locale==='ko'?'닫기':translate(locale,closeMessages.m05a1db569ca0,'Close')}</FanAction></header>
  {!auth.ready?<WalletLoading label={c.loading} kind="wallet"/>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction>:open&&<OwnedWallet key={auth.ownerKey} locale={locale} attendance={false} ticketExchange embedded/>}
 </Dialog>;
}
export function WalletSupportDialog({locale,creatorSlug,open,onClose,initialUnits}:{locale:AppLocale;creatorSlug:string;open:boolean;onClose:()=>void;initialUnits?:number}) {
 const auth=useGroupRequest(),c=walletCopy(locale),titleId=useId();
 const returnTo=`/my/wallet?locale=${locale}&view=support&creator=${encodeURIComponent(creatorSlug)}`;
 return <Dialog open={open} onClose={onClose} labelledBy={titleId} backdropClassName={styles.supportBackdrop} contentClassName={styles.supportDialog}>
  <header className={styles.supportDialogHeader}><h2 id={titleId}>{heartSupportCopy(locale).title}</h2><FanAction onClick={onClose}>{locale==='ko'?'닫기':translate(locale,closeMessages.m05a1db569ca0,'Close')}</FanAction></header>
  {!auth.ready?<WalletLoading label={c.loading} kind="support"/>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction>:open&&<OwnedWallet key={`${auth.ownerKey}:${creatorSlug}`} locale={locale} attendance={false} supportCreator={creatorSlug} initialUnits={initialUnits} embedded/>}
 </Dialog>;
}
function OwnedWallet({ locale, attendance, supportCreator, localProfile, localPresentation, embedded=false, initialUnits, ticketExchange=false }: { locale: AppLocale; attendance: boolean; embedded?:boolean;ticketExchange?:boolean; supportCreator?:string;initialUnits?:number;localProfile?:{nickname:string;avatarUrl:string};localPresentation?:WalletLocalPresentation }) {
 const a=attendanceCopy(locale),support=heartSupportCopy(locale),creator=useGroupResource(supportCreator?`/api/groups/resolve/${encodeURIComponent(supportCreator)}`:null,parseCreator),c = walletCopy(locale), wallet = useGroupResource("/api/me/wallet", parseWallet), history = useGroupResource("/api/me/wallet/history", parseHistory);
 const target = "ticket" as const, [units, setUnits] = useState(()=>typeof initialUnits==="number"&&Number.isInteger(initialUnits)&&initialUnits>=1&&initialUnits<=1000?String(initialUnits):"1"), [pending, setPending] = useState<Pending | null>(null), [storageReady, setStorageReady] = useState(false), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState<"error" | "success" | null>(null);
 const [lastOperation,setLastOperation]=useState<Pending['operation']|null>(null),exchangeForm=useRef<HTMLFormElement>(null),[ad,setAd]=useState<RewardedAdState|null>(null),[adError,setAdError]=useState<string|null>(null),adControl=useRef<{show():boolean;cancel():void}|null>(null),earnedExchange=useRef<Pending|null>(null);
 useEffect(()=>()=>adControl.current?.cancel(),[]);
 const supportInput=useRef<HTMLInputElement>(null),retryingCreator=useRef(false);
 // One completion point for check-in: the screen stays in its busy state until the refetched wallet arrives, then the done view and balance render together.
 const [checkInBase,setCheckInBase]=useState<typeof wallet.data|null>(null),settling=checkInBase!==null&&wallet.data===checkInBase,attendanceBalance=checkInBase!==null&&wallet.data&&wallet.data!==checkInBase?wallet.data.points:null;
 // Server-returned check-in points play once, together with the done view; replayed responses never play.
 const {burst:rewardBurst,add:addReward,clear:clearReward}=usePointRewardBurst(),rewardPending=useRef(0);
 useEffect(()=>{if(attendanceBalance!==null&&rewardPending.current>0){addReward(rewardPending.current);rewardPending.current=0;}},[attendanceBalance,addReward]);
 // A failed balance refetch drops the unplayed award so a later retry or unrelated balance change never replays it.
 useEffect(()=>{if(wallet.error){rewardPending.current=0;setCheckInBase(null);}},[wallet.error]);
 useEffect(()=>{if(retryingCreator.current&&creator.data?.page.slug===supportCreator){retryingCreator.current=false;supportInput.current?.focus();}},[creator.data,supportCreator]);
 const [supportSent,setSupportSent]=useState<{slug:string;units:number}|null>(null);
 const running = useRef(false), alive = useRef(true); const storageKey = `kyaa-wallet-pending:${wallet.ownerKey.split(":").slice(0,-1).join(":")}`;
 useEffect(() => { alive.current = true; try { const stored = sessionStorage.getItem(storageKey); if (stored) setPending(pendingSchema.parse(JSON.parse(stored))); setStorageReady(true); } catch { setFeedback("error"); } return () => { alive.current = false; }; }, [storageKey]);
 function complete(input:Pending) { earnedExchange.current=null; if(input.operation==="check-in")setCheckInBase(wallet.data??null); if(input.operation==="support")setSupportSent({slug:input.celebritySlug,units:input.units}); sessionStorage.removeItem(storageKey); setPending(null); setFeedback("success"); wallet.retry(); history.retry(); }
 // Points move only after the ad reports a granted reward; cancel, no-fill and failures never reach the debit.
 async function startRewardedExchange(input: Pending) {
  setFeedback(null);setAdError(null);
  const control=await runRewardedSession({
   post:(path,body)=>wallet.request(path,{method:'POST',body:JSON.stringify(body)}),
   unit:rewardedAdUnit(),loadGpt:loadRewardedGpt,requestAd:requestRewardedAd,onState:setAd,alive:()=>alive.current,
   onGranted:id=>{const withSession={...input,adSessionId:id};earnedExchange.current=withSession;setAd('earned');void submit(withSession);},
   onRefused:error=>{adControl.current=null;setAd(null);const code=error instanceof GroupRequestError?error.code:undefined,copy=code?rewardedSessionError(locale,code):undefined;if(copy)setAdError(copy);else if(code==='GROUP_WALLET_INSUFFICIENT_BALANCE'){setLastOperation('exchange');setFeedback('error');}else setAdError(rewarded.failed);}
  });
  adControl.current=control;
 }
 async function submit(input: Pending, recover = false) {
  if (running.current || !storageReady) return;
  running.current = true; setLastOperation(input.operation); setBusy(true); setFeedback(null);setSupportSent(null);
  try {
   // Persist the original request before sending; a timeout never creates a new debit key.
   sessionStorage.setItem(storageKey, JSON.stringify(input)); setPending(input);
   if (recover) {
    const saved = requestSchema.parse(await wallet.request(`/api/me/wallet/requests/${input.requestKey}`));
    if (!alive.current) return;
    if (saved.status === "committed") { complete(input); return; }
    if (saved.status === "legacy") throw new Error("Original request context required");
    if(input.operation==='exchange'&&saved.status==='unknown')throw new Error("RESULT_UNCONFIRMED");
   }
   const { operation, ...body } = input;
   const result = await wallet.request(`/api/me/wallet/${operation}`, { method: "POST", body: JSON.stringify(body) });
   if (!alive.current) return;
   if (operation === "exchange") exchangeSchema.parse(result); else if(operation === "support") supportSchema.parse(result); else{const checked=checkInSchema.parse(result);rewardPending.current=checked.replayed?0:checked.pointsAwarded;}
   complete(input);
  } catch (error) { if (alive.current) {
   if (error instanceof GroupRequestError && ["GROUP_WALLET_INVALID", "GROUP_WALLET_POLICY_CHANGED", "GROUP_WALLET_INSUFFICIENT_BALANCE", "GROUP_WALLET_REWARDS_NOT_STARTED", "GROUP_WALLET_TARGET_UNAVAILABLE", "GROUP_WALLET_AD_SESSION_INVALID", "GROUP_WALLET_AD_DAILY_LIMIT", "GROUP_WALLET_AD_RATE_LIMITED", "GROUP_WALLET_AD_CONFIG_MISSING", "GROUP_WALLET_AD_SESSION_REQUIRED", "GROUP_WALLET_AD_GATE_CLOSED"].includes(error.code)) { sessionStorage.removeItem(storageKey); setPending(null); wallet.retry(); }
   setFeedback("error");
  } }
  finally { running.current = false; if (alive.current) setBusy(false); }
 }
 if (wallet.loading) return <WalletLoading label={c.loading} kind={supportCreator?"support":attendance?"attendance":"wallet"}/>;
 if (!wallet.data) return <SourceStatePanel sourceId="QnIgR" title={locale==='ko'?'잔액을 불러오지 못했어요':c.error} description={locale==='ko'?'내 포인트·하트·응모권을 다시 확인해 주세요.':c.error} icon={<CircleAlert size={24}/>} feedback="danger" role="alert" actions={[{label:locale==='ko'?'잔액 다시 확인':c.retry,onClick:wallet.retry,variant:'primary'}]}><dl>{[c.points,c.hearts,c.tickets].map(label=><div key={label} style={{display:'flex',justifyContent:'space-between'}}><dt>{label}</dt><dd>—</dd></div>)}</dl></SourceStatePanel>;
 const data = wallet.data, earned=data.attendance.days.find(day=>day.date===data.attendance.date)?.points, rewardsPending=Boolean(data.rewardsStartOn&&data.attendance.date<data.rewardsStartOn), quantity = Number(units), valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000, cost = valid ? quantity * data.pointCost : 0, adActive = ad==='loading'||ad==='ready'||ad==='showing', locked = busy || Boolean(pending) || data.writeFenced || !storageReady || adActive, rewarded = rewardedExchangeCopy(locale);
 return <div className={`${styles.shell} ${localPresentation?styles.sourceWallet:''} ${embedded?styles.embeddedSupport:''}`}><PointRewardBurst locale={locale} points={rewardBurst?.points??0} burstKey={rewardBurst?.key} onDone={clearReward} announce={false}/><div className={styles.layout}>
 {!attendance&&!supportCreator&&!ticketExchange&&<><section className={styles.balancePanel}><h2>{locale === "ko" ? "활동에 사용하는 포인트·아이템" : c.wallet}</h2><dl className={styles.balances}>{([["points", Coins, data.points], ["hearts", Heart, data.hearts], ["tickets", Ticket, data.tickets]] as const).map(([key, Icon, value]) => <div key={key}><dt>{key==='tickets'&&locale==='ko'?'모임 응모권':c[key]}</dt><dd>{value.toLocaleString(locale)}<span className={styles.balanceUnit} data-asset={key}>{key==='points'?'P':locale==='ko'?key==='hearts'?'개':'장':''}</span></dd><Icon size={24} aria-hidden="true"/></div>)}</dl></section></>}
 {pending && !(attendance&&pending.operation==='check-in'&&busy&&!feedback) && <SourceStatePanel sourceId={pending.operation==='support'?undefined:pending.operation==='check-in'?'NcJxO':feedback==='error'?'VMiFI':'cPjvM'} title={locale==='ko'&&pending.operation!=='support'?pending.operation==='check-in'?'출석을 확인하고 있어요':feedback==='error'?'전환 결과를 확인해 주세요':'교환을 확인하고 있어요':feedback==='error'?c.pending:walletPendingTitle(locale)} description={<><p>{feedback==='error'?pending.operation==='exchange'&&locale==='ko'?'전환 완료 여부를 확인하지 못했어요. 내역을 확인한 뒤 다시 진행해 주세요.':c.error:c.pending}</p>{pending.operation==='support'&&<p>{support.title} · {pending.celebritySlug} · {pending.units.toLocaleString(locale)} {c.hearts}</p>}</>} icon={feedback==='error'?<CircleAlert size={24}/>:<Clock3 size={24}/>} feedback={feedback==='error'?'danger':undefined} role={feedback==='error'?'alert':'status'} actions={pending.operation==='exchange'&&feedback==='error'?[{label:locale==='ko'?'교환 내역 확인':c.history,href:`/my/wallet?locale=${locale}#wallet-history`,variant:'primary'}]:[{label:c.recover,disabled:busy,busy,onClick:()=>void submit(pending,true),variant:'primary'}]}/>}
 {feedback && !pending && !(attendance&&feedback==='success') && <SourceStatePanel sourceId={feedback==='error'&&lastOperation==='exchange'?'QnKkN':undefined} title={feedback==='error'?locale==='ko'&&lastOperation==='exchange'?'교환을 완료하지 못했어요':c.error:feedback==='success'&&supportSent?`${support.sent.replace('{name}',creator.data?.page.slug===supportSent.slug?creator.data.page.name:supportSent.slug)} · ${supportSent.units.toLocaleString(locale)} ${c.hearts}`:c[feedback]} icon={feedback==='error'?<CircleAlert size={24}/>:<Check size={24}/>} description={feedback==='error'?c.error:undefined} feedback={feedback==='error'?'danger':'success'} role={feedback==='error'?'alert':'status'} actions={feedback==='error'&&lastOperation==='exchange'?[...(ticketExchange?[{label:c.retry,onClick:()=>{if(earnedExchange.current)void submit(earnedExchange.current);else exchangeForm.current?.requestSubmit();},variant:'primary' as const}]:[]),{label:c.history,href:`/my/wallet?locale=${locale}#wallet-history`}]:[]}/>}

 {supportCreator&&<section className={styles.panel}>{creator.data?.page.kind==='fan'&&creator.data.page.celebrityId&&creator.data.page.slug===supportCreator?<><header className={styles.supportIdentity}><GroupAvatar page={creator.data.page} locale={locale}/><h2>{creator.data.page.name}</h2></header><form onSubmit={event=>{event.preventDefault();if(valid&&quantity<=data.hearts&&!locked)void submit({operation:'support',requestKey:crypto.randomUUID(),policyVersion:data.policyVersion,celebritySlug:supportCreator,units:quantity});}}><fieldset disabled={locked}><dl className={styles.calculation}><div><dt>{c.hearts}</dt><dd>{data.hearts.toLocaleString(locale)}</dd></div></dl><label className={styles.quantity}>{support.quantity}<input ref={supportInput} type="number" min={1} max={Math.min(1000,data.hearts)} step={1} value={units} onChange={event=>setUnits(event.target.value)} required/></label><dl className={styles.calculation}><div><dt>{support.remaining}</dt><dd>{valid&&quantity<=data.hearts?(data.hearts-quantity).toLocaleString(locale):'—'}</dd></div></dl>{quantity>data.hearts&&<p role='status' className={styles.errorText}>{support.insufficient}</p>}<FanAction className={styles.primary} variant="primary" type="submit" disabled={!valid||quantity>data.hearts} leadingIcon={<Heart/>}>{support.title}</FanAction><FanAction href={`/my/wallet?locale=${locale}`}>{c.exchange}</FanAction></fieldset></form></>:creator.loading?<WalletLoading label={c.loading} kind="support"/>:<div role="alert"><p>{c.error}</p><FanAction onClick={()=>{retryingCreator.current=true;creator.retry();}}>{c.retry}</FanAction></div>}</section>}
 {attendance&&<section className={styles.attendance}><div className={styles.streakHeader}><h3 className={styles.streakHeading}>{data.attendance.streak===0?attendanceFirstStampLabel(locale):<>{attendanceStreakLabel(locale,data.attendance.streak)}{locale==='ko'?' 중':''}</>}</h3>{locale==='ko'&&!data.attendance.checkedIn&&data.attendance.nextBonusIn===1&&<p>오늘 일곱 번째 도장을 찍어요</p>}</div>{!data.attendance.checkedIn&&<p className={styles.attendanceRule}>{locale==='ko'?'매일 출석하면 10P · 7일 연속이면 보너스 20P':[a.daily,c.bonus].map(part=>part.replace(/[.。]$/,'')).join(' · ')}</p>}<ol className={styles.streak}>{Array.from({length:7},(_,index)=>{const filled=data.attendance.checkedIn&&data.attendance.streak%7===0?7:data.attendance.streak%7,completed=index<filled;return <li key={index} data-complete={completed} data-bonus={index===6} data-today={!data.attendance.checkedIn&&index===filled?'true':undefined}><span>{index+1}{locale==='ko'?'일':''}</span>{completed?<GroupImage src="/images/community-stamps/daily-checkin.png" alt={a.stamps} locale={locale} width={64} height={64}/>:index===6?<Gift aria-hidden="true"/>:<CalendarCheck aria-hidden="true"/>}</li>;})}</ol>{data.attendance.checkedIn?<><p className={styles.attendanceDone} role="status"><Check size={20} aria-hidden="true"/><span>{locale==='ko'?'오늘 출석 완료':c.checkedIn}</span>{earned!==undefined&&<strong>+{earned.toLocaleString(locale)}P</strong>}{attendanceBalance!==null&&<small>{c.points} {attendanceBalance.toLocaleString(locale)} P</small>}</p><FanAction fullWidth href={`/my/wallet?view=attendance&locale=${locale}#attendance-record`}>{attendanceRecordLabel(locale)}</FanAction></>:<FanAction className={styles.primary} variant="primary" trailingIcon={<Stamp/>} disabled={locked || rewardsPending || settling} loading={busy||settling} onClick={() => void submit({ operation: "check-in", requestKey: crypto.randomUUID() })}>{rewardsPending ? walletStartLabel(locale,data.rewardsStartOn!) : (locale==='ko'?`오늘 ${c.checkIn}`:c.checkIn).replace("10P", data.attendance.nextBonusIn === 1 ? "30P" : "10P")}</FanAction>}</section>}
 {!attendance&&!supportCreator&&!ticketExchange&&<section className={`${styles.panel} ${styles.benefitsRedirect}`}><h2>{locale==='ko'?'포인트는 덕질에서 사용해요':c.exchange}</h2><FanAction variant="text" href={localPresentation?.benefitsHref??`/benefits?locale=${locale}`}>{locale==='ko'?'덕질에서 전환·사용':c.exchange}</FanAction></section>}
 {ticketExchange&&<section className={`${styles.panel} ${styles.exchange}`}><h2>{locale === "ko" ? "포인트로 교환하기" : c.exchange}</h2><form ref={exchangeForm} onSubmit={event => { event.preventDefault(); if (data.pointCost <= data.points && !locked) void startRewardedExchange({ operation: "exchange", requestKey: crypto.randomUUID(), policyVersion: data.policyVersion, target, units: 1 }); }}>
 <fieldset disabled={locked}><legend>{c.exchange}</legend><dl className={styles.calculation}><div className={styles.calculationTitle}>{locale === "ko" ? "교환 내용 확인" : c.exchange}</div><div><dt>{c.cost}</dt><dd>{`${data.pointCost.toLocaleString(locale)} P`}</dd></div><div><dt>{c.remaining}</dt><dd>{data.pointCost <= data.points ? `${(data.points-data.pointCost).toLocaleString(locale)} P` : "—"}</dd></div></dl>{ad!=='ready'&&<FanAction className={styles.primary} variant="primary" type="submit" disabled={data.pointCost > data.points||adError===rewarded.adOff||ad==='unsupported'}>{rewarded.action}</FanAction>}</fieldset>{ad==='ready'&&<FanAction className={styles.primary} variant="primary" onClick={()=>adControl.current?.show()}>{rewarded.watch}</FanAction>}{ad==='loading'&&<p role="status">{rewarded.loading}</p>}{adError&&<p role="alert" className={styles.errorText}>{adError}</p>}{ad==='cancelled'&&<p role="status">{rewarded.incomplete}</p>}{(ad==='no-fill'||ad==='unsupported'||ad==='error')&&<p role="status" className={styles.adCause}>{ad==='unsupported'?rewarded.unsupported:ad==='error'?rewarded.failed:rewarded.unavailable}</p>}</form></section>}
 {!attendance&&!supportCreator&&!ticketExchange&&<section className={`${styles.panel} ${styles.history}`}><h2 id="wallet-history">{locale==="ko"?"내역":c.history}</h2><HistoryTabs locale={locale} active="ledger"/>{history.loading ? <WalletLoading label={c.loading} kind="history"/> : history.error ? <SourceStatePanel sourceId="iboGb" title={locale==='ko'?'지급 내역을 확인할 수 없어요':c.error} description={c.error} icon={<CircleAlert size={24}/>} feedback="danger" role="alert" actions={[{label:c.retry,onClick:history.retry,variant:'primary'}]}/> : localPresentation?.historyRows ? <ul>{localPresentation.historyRows.map(row=><li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul> : !history.data?.entries.length ? <p>{c.empty}</p> : <ul>{history.data.entries.map(entry => <li key={entry.id}><span>{entry.asset === "fan_point" ? <Coins aria-hidden="true" size={20}/> : entry.asset === "ticket" ? <Ticket aria-hidden="true" size={20}/> : <Heart aria-hidden="true" size={20}/>}<span>{walletHistoryLabel(locale,entry.sourceType)&&<span className={styles.historyReason}>{walletHistoryLabel(locale,entry.sourceType)}</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Seoul" })}</time></span></span><strong>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString(locale)} {entry.asset === "fan_point" ? "P" : entry.asset === "ticket" ? c.tickets : c.hearts}</strong></li>)}</ul>}</section>}

 </div>{!embedded&&<aside className={styles.aside}><h2><BookOpen aria-hidden="true"/>MY</h2>{(attendance||localPresentation)&&localProfile&&<div className={styles.attendanceProfile}><GroupImage locale={locale} src={localProfile.avatarUrl} alt="" width={36} height={36}/><strong>{localProfile.nickname}</strong></div>}<nav>{[{href:'/my',label:(attendance||localPresentation)&&locale==='ko'?'패스포트·도장':c.passport,Icon:BookOpen},{href:'/my/wallet?view=attendance',label:c.attendance,Icon:CalendarCheck},{href:'/pages/groups?mine=joined',label:groupsCopy(locale).joinedPages,Icon:UsersRound},{href:'/my/wallet',label:c.wallet,Icon:Coins}].map(item=><FanAction key={item.href} href={`${item.href}${item.href.includes('?')?'&':'?'}locale=${locale}`} leadingIcon={<item.Icon/>} aria-current={(attendance?item.href.includes('view=attendance'):item.href==='/my/wallet')?'page':undefined}>{item.label}</FanAction>)}</nav>{attendance&&<section><header id="attendance-record" className={styles.attendanceRecordHeading}><Stamp aria-hidden="true"/><h3>{a.record}</h3></header><strong>{a.earned} {data.attendance.days.reduce((sum,day)=>sum+day.points,0)}{locale==='ko'?'P':' P'}</strong>{locale==='ko'&&!data.attendance.checkedIn&&<strong className={styles.projectedPoints}>오늘 출석 후 {data.attendance.days.reduce((sum,day)=>sum+day.points,0)+(data.attendance.nextBonusIn===1?30:10)}P</strong>}{locale==='ko'&&<p>도장은 패스포트에서 다시 볼 수 있어요.</p>}<FanAction href={`/passports?locale=${locale}`}>{locale==='ko'?'패스포트 보기':c.stamps}</FanAction></section>}</aside>}</div>;
}
