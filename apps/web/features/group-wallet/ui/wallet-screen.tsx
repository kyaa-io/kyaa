"use client";
import {MyAttendanceList} from "@/features/dukjil/ui/my-attendance-list";
import {DukjilProvider,DukjilSwitch} from "@/features/dukjil/ui/dukjil-provider";
import {dukjilText} from "@/features/dukjil/ui/dukjil-copy";
import {HistoryTabs} from '@/features/groups/ui/history-tabs';
import { useEffect, useRef, useState, useId } from "react";
import { BookOpen, CalendarCheck, Coins, Gift, Ticket, UsersRound, Stamp, WalletCards, CircleAlert, Clock3, Check } from "lucide-react";
import { z } from "zod";
import {useRouter} from "next/navigation";
import type {Route} from "next";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useGroupResource, useGroupRequest, GroupRequestError, GROUP_WALLET_CHANGED_EVENT } from "@/features/groups/ui/use-group-resource";
import { walletSchema, historySchema, requestSchema, exchangeSchema, checkInSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import { walletHistoryLabel } from "./history-label";
import { WalletCard } from "./wallet-card";
import { POINT_COIN_SRC } from "@/features/dukjil/ui/earn-badge";
import { GroupImage } from "@/features/groups/ui/group-image";
import { attendanceCopy, attendanceFirstStampLabel, attendanceRecordLabel, walletPendingTitle } from "./attendance-copy";
import { groupsCopy } from "@/features/groups/ui/copy";
import { walletCopy, walletStartLabel, attendanceStreakLabel, ticketSingular } from "./copy";
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
const pendingSchema = z.object({ operation: z.enum(["exchange", "check-in"]), requestKey: z.uuid(), target: z.literal("ticket").optional(), units: z.number().int().min(1).max(1000).optional(), policyVersion: z.literal("group-wallet-v1").optional(), adSessionId: z.uuid().optional() });
type Pending = z.infer<typeof pendingSchema>;
function WalletLoading({label,kind='wallet'}:{label:string;kind?:'wallet'|'history'|'attendance'}) {
 return <div className={`${styles.loadingSkeleton} ${styles[`loading_${kind}`]}`} role="status" aria-busy="true" aria-label={label}><div aria-hidden="true"><i/><i/><i/><i/></div></div>;
}
/** `support_voucher` is what an exchange gives: the group ticket. */
const isTicketAsset=(asset:string)=>asset==="ticket"||asset==="support_voucher";
export type WalletLocalPresentation={benefitsHref:string;historyRows?:{label:string;value:string}[]};
export function WalletScreen({ locale, attendance = false, localProfile, localPresentation }: { locale: AppLocale; attendance?: boolean; localProfile?:{nickname:string;avatarUrl:string};localPresentation?:WalletLocalPresentation }) {
 const auth = useGroupRequest(), c = walletCopy(locale),returnTo=`/my/wallet?locale=${locale}${attendance?"&view=attendance":""}`;
 if(attendance)return <WalletAttendanceRoute locale={locale}/>;
 return <FanAppFrame locale={locale} currentPath="/my" groupsEnabled mainId="wallet-main"><FanContentContainer as="main" id="wallet-main" tabIndex={-1} className={`${styles.page} ${attendance?styles.attendancePage:styles.walletPage}`}><FanHeading as="h1" variant="personal-page">{attendance&&<Stamp className={styles.mobileHeadingIcon} aria-hidden="true"/>}{attendance?<> <span className={styles.desktopHeading}>My / {c.attendance}</span><span className={styles.mobileHeading}>{attendanceCopy(locale).stamps}</span></>:<>{localPresentation?<WalletCards className={styles.mobileHeadingIcon} aria-hidden="true"/>:<Coins className={styles.mobileHeadingIcon} aria-hidden="true"/>}<span className={styles.desktopHeading}>My / {c.wallet}</span><span className={styles.mobileHeading}>{c.wallet}</span></>}</FanHeading>
 {!auth.ready ? <WalletLoading label={c.loading} kind={attendance?"attendance":"wallet"}/> : !auth.authenticated ? <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction> : <OwnedWallet key={auth.ownerKey} locale={locale} attendance={attendance} localProfile={localProfile} localPresentation={localPresentation} />}
 </FanContentContainer></FanAppFrame>;
}
export type WalletHistoryPreview={rows:number;/** Rows shown from 1024px, where the history sits in the wallet card beside the body. */wideRows?:number;moreLabel:string;lessLabel:string;onFailure?:(failed:boolean,retry:()=>void)=>void;hideError?:boolean};
/** True while the viewport is at least `px` wide (false before mount and without matchMedia). */
function useMinWidth(px:number){
 const [match,setMatch]=useState(false);
 useEffect(()=>{if(typeof window.matchMedia!=='function')return;const query=window.matchMedia(`(min-width:${px}px)`),update=()=>setMatch(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[px]);
 return match;
}
export function WalletHistoryPanel({locale,localRows,preview,className}:{locale:AppLocale;localRows?:{label:string;value:string}[];preview?:WalletHistoryPreview;className?:string}) {
 const c=walletCopy(locale),history=useGroupResource("/api/me/wallet/history", parseHistory),[expanded,setExpanded]=useState(false),scrolled=useRef(false),retryRef=useRef(history.retry),failureRef=useRef(preview?.onFailure),hasPreview=preview!==undefined,wide=useMinWidth(1024),previewRows=preview?(wide&&preview.wideRows?preview.wideRows:preview.rows):0;
 useEffect(()=>{retryRef.current=history.retry;failureRef.current=preview?.onFailure;});
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,history.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,history.retry);},[history.retry]);
 // The history address (#wallet-history, reached from /my/wallet and the tabs) opens the list in full and scrolls to it once rows exist.
 useEffect(()=>{if(!hasPreview)return;const open=()=>{if(window.location.hash==='#wallet-history'){setExpanded(true);scrolled.current=false;}};open();window.addEventListener('hashchange',open);return()=>window.removeEventListener('hashchange',open);},[hasPreview]);
 const settled=!history.loading,failed=Boolean(history.error);
 useEffect(()=>{if(settled)failureRef.current?.(failed,()=>retryRef.current());},[settled,failed]);
 useEffect(()=>{if(!hasPreview||!expanded||!settled||scrolled.current||window.location.hash!=='#wallet-history')return;scrolled.current=true;document.getElementById('wallet-history')?.scrollIntoView?.({block:'start'});},[hasPreview,expanded,settled]);
 const entries=history.data?.entries??[],shown=preview&&!expanded?entries.slice(0,previewRows):entries,toggle=Boolean(preview&&!history.loading&&!history.error&&!localRows&&entries.length>previewRows);
 const title=locale==="ko"?"내역":c.history,errorTitle=locale==='ko'?'지급 내역을 확인할 수 없어요':c.error;
 const body=history.loading ? (preview?<div className={styles.historySkeleton} role="status" aria-busy="true" aria-label={c.loading}><div aria-hidden="true">{Array.from({length:previewRows},(_,item)=><i key={item}/>)}</div></div>:<WalletLoading label={c.loading} kind="history"/>) : history.error ? (preview?.hideError?null:preview?<FanState inline compact kind="error" title={locale==='ko'?'내역을 불러오지 못했어요':errorTitle} actions={<FanAction variant="text" onClick={history.retry}>{c.retry}</FanAction>}/>:<FanState inline kind="error" title={errorTitle} description={locale==='ko'?c.error:undefined} actions={<FanAction onClick={history.retry}>{c.retry}</FanAction>}/>) : localRows ? <ul>{localRows.map(row=><li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul> : !entries.length ? <FanState inline compact={Boolean(preview)} kind="empty" title={c.empty}/> : <ul>{shown.map(entry => <li key={entry.id}><span>{isTicketAsset(entry.asset) ? <Ticket aria-hidden="true" size={20}/> : <img src={POINT_COIN_SRC} alt="" width={20} height={20}/>}<span>{walletHistoryLabel(locale,entry.sourceType,entry)&&<span className={styles.historyReason}>{walletHistoryLabel(locale,entry.sourceType,entry)}</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Seoul" })}</time></span></span><strong>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString(locale)} {entry.asset === "fan_point" ? "P" : isTicketAsset(entry.asset) ? (Math.abs(entry.amount) === 1 ? ticketSingular[locale] ?? c.tickets : c.tickets) : ""}</strong></li>)}</ul>;
 if(preview)return <section className={`${styles.history} ${styles.historyPreview} ${className??""}`}><div className={styles.historyHead}><h2 id="wallet-history">{title}</h2>{toggle&&<FanAction variant="text" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?preview.lessLabel:preview.moreLabel}{" "}<span aria-hidden="true">›</span></FanAction>}</div><div className={styles.historyCard}><HistoryTabs locale={locale} active="ledger"/><div className={styles.historyBody} data-history-rows={previewRows}>{body}</div></div></section>;
 return <section className={`${styles.panel} ${styles.history}`}><h2 id="wallet-history">{title}</h2><HistoryTabs locale={locale} active="ledger"/>{body}</section>;
}
function WalletAttendanceRoute({locale}:{locale:AppLocale}) {
 const router=useRouter(),href=`/my?locale=${locale}`;
 return <FanAppFrame locale={locale} currentPath="/my" groupsEnabled mainId="attendance-main"><FanContentContainer as="main" id="attendance-main" tabIndex={-1} className={styles.page}><div className={styles.srOnly}><FanHeading as="h1" variant="personal-page">{walletCopy(locale).attendance}</FanHeading></div></FanContentContainer><WalletAttendanceDialog locale={locale} open onClose={()=>router.replace(href as Route)}/></FanAppFrame>;
}
export function WalletAttendanceDialog({locale,open,onClose}:{locale:AppLocale;open:boolean;onClose:()=>void}) {
 const auth=useGroupRequest(),c=walletCopy(locale),titleId=useId(),returnTo=`/my/wallet?view=attendance&locale=${locale}`;
 return <DukjilProvider locale={locale}><Dialog open={open} onClose={onClose} labelledBy={titleId} backdropClassName={styles.supportBackdrop} contentClassName={`${styles.supportDialog} ${styles.attendanceDialog}`}>
  <header className={styles.supportDialogHeader}><h2 id={titleId}><DukjilSwitch on={dukjilText(locale,"dukjilListTitle")} off={c.attendance} loading={c.attendance}/></h2><FanAction onClick={onClose}>{locale==='ko'?'닫기':translate(locale,closeMessages.m05a1db569ca0,'Close')}</FanAction></header>
  {!auth.ready?<WalletLoading label={c.loading} kind="attendance"/>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{c.login}</FanAction>:open&&<DukjilSwitch loading={<WalletLoading label={c.loading} kind="attendance"/>} on={<MyAttendanceList key={auth.ownerKey} locale={locale}/>} off={<OwnedWallet key={auth.ownerKey} locale={locale} attendance embedded/>}/>}
 </Dialog></DukjilProvider>;
}
function OwnedWallet({ locale, attendance, localProfile, localPresentation, embedded=false }: { locale: AppLocale; attendance: boolean; embedded?:boolean;localProfile?:{nickname:string;avatarUrl:string};localPresentation?:WalletLocalPresentation }) {
 const a=attendanceCopy(locale),c = walletCopy(locale), wallet = useGroupResource("/api/me/wallet", parseWallet);
 const [pending, setPending] = useState<Pending | null>(null), [storageReady, setStorageReady] = useState(false), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState<"error" | "success" | null>(null);
 const [lastOperation,setLastOperation]=useState<Pending['operation']|null>(null);
 // One completion point for check-in: the screen stays in its busy state until the refetched wallet arrives, then the done view and balance render together.
 const [checkInBase,setCheckInBase]=useState<typeof wallet.data|null>(null),settling=checkInBase!==null&&wallet.data===checkInBase,attendanceBalance=checkInBase!==null&&wallet.data&&wallet.data!==checkInBase?wallet.data.points:null;
 // Server-returned check-in points play once, together with the done view; replayed responses never play.
 const {burst:rewardBurst,add:addReward,clear:clearReward}=usePointRewardBurst(),rewardPending=useRef(0);
 useEffect(()=>{if(attendanceBalance!==null&&rewardPending.current>0){addReward(rewardPending.current);rewardPending.current=0;}},[attendanceBalance,addReward]);
 // A failed balance refetch drops the unplayed award so a later retry or unrelated balance change never replays it.
 useEffect(()=>{if(wallet.error){rewardPending.current=0;setCheckInBase(null);}},[wallet.error]);
 const running = useRef(false), alive = useRef(true); const storageKey = `kyaa-wallet-pending:${wallet.ownerKey.split(":").slice(0,-1).join(":")}`;
 useEffect(() => { alive.current = true; try { const stored = sessionStorage.getItem(storageKey); if (stored) setPending(pendingSchema.parse(JSON.parse(stored))); setStorageReady(true); } catch { setFeedback("error"); } return () => { alive.current = false; }; }, [storageKey]);
 function complete(input:Pending) { if(input.operation==="check-in")setCheckInBase(wallet.data??null); sessionStorage.removeItem(storageKey); setPending(null); setFeedback("success"); wallet.retry(); }
 async function submit(input: Pending, recover = false) {
  if (running.current || !storageReady) return;
  running.current = true; setLastOperation(input.operation); setBusy(true); setFeedback(null);
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
   if (operation === "exchange") exchangeSchema.parse(result); else{const checked=checkInSchema.parse(result);rewardPending.current=checked.replayed?0:checked.pointsAwarded;}
   complete(input);
  } catch (error) { if (alive.current) {
   if (error instanceof GroupRequestError && ["GROUP_WALLET_INVALID", "GROUP_WALLET_POLICY_CHANGED", "GROUP_WALLET_INSUFFICIENT_BALANCE", "GROUP_WALLET_REWARDS_NOT_STARTED", "GROUP_WALLET_TARGET_UNAVAILABLE", "GROUP_WALLET_AD_SESSION_INVALID", "GROUP_WALLET_AD_DAILY_LIMIT", "GROUP_WALLET_AD_RATE_LIMITED", "GROUP_WALLET_AD_CONFIG_MISSING", "GROUP_WALLET_AD_SESSION_REQUIRED", "GROUP_WALLET_AD_GATE_CLOSED"].includes(error.code)) { sessionStorage.removeItem(storageKey); setPending(null); wallet.retry(); }
   setFeedback("error");
  } }
  finally { running.current = false; if (alive.current) setBusy(false); }
 }
 if (wallet.loading) return <WalletLoading label={c.loading} kind={attendance?"attendance":"wallet"}/>;
 if (!wallet.data) return <SourceStatePanel sourceId="QnIgR" title={locale==='ko'?'잔액을 불러오지 못했어요':c.error} description={locale==='ko'?'내 포인트·응모권을 다시 확인해 주세요.':c.error} icon={<CircleAlert size={24}/>} feedback="danger" role="alert" actions={[{label:locale==='ko'?'잔액 다시 확인':c.retry,onClick:wallet.retry,variant:'primary'}]}><dl>{[c.points,c.tickets].map(label=><div key={label} style={{display:'flex',justifyContent:'space-between'}}><dt>{label}</dt><dd>—</dd></div>)}</dl></SourceStatePanel>;
 const data = wallet.data, earned=data.attendance.days.find(day=>day.date===data.attendance.date)?.points, rewardsPending=Boolean(data.rewardsStartOn&&data.attendance.date<data.rewardsStartOn), locked = busy || Boolean(pending) || data.writeFenced || !storageReady;
 return <div className={`${styles.shell} ${localPresentation?styles.sourceWallet:''} ${embedded?styles.embeddedSupport:''}`}><PointRewardBurst locale={locale} points={rewardBurst?.points??0} burstKey={rewardBurst?.key} onDone={clearReward} announce={false}/><div className={styles.layout}>
 {!attendance&&<WalletCard locale={locale} title={c.wallet} href={localPresentation?.benefitsHref??`/benefits?locale=${locale}#wallet`} hearts="missing" state={{kind:"ready",points:data.points,tickets:data.tickets,pointCost:data.pointCost}}/>}
 {pending && !(attendance&&pending.operation==='check-in'&&busy&&!feedback) && <SourceStatePanel sourceId={pending.operation==='check-in'?'NcJxO':feedback==='error'?'VMiFI':'cPjvM'} title={locale==='ko'?pending.operation==='check-in'?'출석을 확인하고 있어요':feedback==='error'?'전환 결과를 확인해 주세요':'교환을 확인하고 있어요':feedback==='error'?c.pending:walletPendingTitle(locale)} description={<p>{feedback==='error'?pending.operation==='exchange'&&locale==='ko'?'전환 완료 여부를 확인하지 못했어요. 내역을 확인한 뒤 다시 진행해 주세요.':c.error:c.pending}</p>} icon={feedback==='error'?<CircleAlert size={24}/>:<Clock3 size={24}/>} feedback={feedback==='error'?'danger':undefined} role={feedback==='error'?'alert':'status'} actions={pending.operation==='exchange'&&feedback==='error'?[{label:locale==='ko'?'교환 내역 확인':c.history,href:`/my/wallet?locale=${locale}`,variant:'primary'}]:[{label:c.recover,disabled:busy,busy,onClick:()=>void submit(pending,true),variant:'primary'}]}/>}
 {feedback && !pending && !(attendance&&feedback==='success') && <SourceStatePanel sourceId={feedback==='error'&&lastOperation==='exchange'?'QnKkN':undefined} title={feedback==='error'?locale==='ko'&&lastOperation==='exchange'?'교환을 완료하지 못했어요':c.error:c[feedback]} icon={feedback==='error'?<CircleAlert size={24}/>:<Check size={24}/>} description={feedback==='error'?c.error:undefined} feedback={feedback==='error'?'danger':'success'} role={feedback==='error'?'alert':'status'} actions={feedback==='error'&&lastOperation==='exchange'?[{label:c.history,href:`/my/wallet?locale=${locale}#wallet-history`}]:[]}/>}

 {attendance&&<section className={styles.attendance}><div className={styles.streakHeader}><h3 className={styles.streakHeading}>{data.attendance.streak===0?attendanceFirstStampLabel(locale):<>{attendanceStreakLabel(locale,data.attendance.streak)}{locale==='ko'?' 중':''}</>}</h3>{locale==='ko'&&!data.attendance.checkedIn&&data.attendance.nextBonusIn===1&&<p>오늘 일곱 번째 스탬프를 찍어요</p>}</div>{!data.attendance.checkedIn&&<p className={styles.attendanceRule}>{[a.daily,c.bonus].map(part=>part.replace(/[.。]$/,'')).join(' · ')}</p>}<ol className={styles.streak}>{Array.from({length:7},(_,index)=>{const filled=data.attendance.checkedIn&&data.attendance.streak%7===0?7:data.attendance.streak%7,completed=index<filled;return <li key={index} data-complete={completed} data-bonus={index===6} data-today={!data.attendance.checkedIn&&index===filled?'true':undefined}><span>{index+1}{locale==='ko'?'일':''}</span>{completed?<GroupImage src="/images/community-stamps/daily-checkin.png" alt={a.stamps} locale={locale} width={64} height={64}/>:index===6?<Gift aria-hidden="true"/>:<CalendarCheck aria-hidden="true"/>}</li>;})}</ol>{data.attendance.checkedIn?<><p className={styles.attendanceDone} role="status"><Check size={20} aria-hidden="true"/><span>{locale==='ko'?'오늘 출석 완료':c.checkedIn}</span>{earned!==undefined&&<strong>+{earned.toLocaleString(locale)}P</strong>}{attendanceBalance!==null&&<small>{c.points} {attendanceBalance.toLocaleString(locale)} P</small>}</p><FanAction fullWidth href={`/my/wallet?view=attendance&locale=${locale}#attendance-record`}>{attendanceRecordLabel(locale)}</FanAction></>:<FanAction className={styles.primary} variant="primary" trailingIcon={<Stamp/>} disabled={locked || rewardsPending || settling} loading={busy||settling} onClick={() => void submit({ operation: "check-in", requestKey: crypto.randomUUID() })}>{rewardsPending ? walletStartLabel(locale,data.rewardsStartOn!) : (locale==='ko'?`오늘 ${c.checkIn}`:c.checkIn)}</FanAction>}</section>}
 
 {!attendance&&<WalletHistoryPanel locale={locale} localRows={localPresentation?.historyRows}/>}

 </div>{!embedded&&<aside className={styles.aside}><h2><BookOpen aria-hidden="true"/>MY</h2>{(attendance||localPresentation)&&localProfile&&<div className={styles.attendanceProfile}><GroupImage locale={locale} src={localProfile.avatarUrl} alt="" width={36} height={36}/><strong>{localProfile.nickname}</strong></div>}<nav>{[{href:'/my',label:(attendance||localPresentation)&&locale==='ko'?'패스포트·스탬프':c.passport,Icon:BookOpen},{href:'/my/wallet?view=attendance',label:c.attendance,Icon:CalendarCheck},{href:'/pages/groups?mine=joined',label:groupsCopy(locale).joinedPages,Icon:UsersRound},{href:'/my/wallet',label:c.wallet,Icon:Coins}].map(item=><FanAction key={item.href} href={`${item.href}${item.href.includes('?')?'&':'?'}locale=${locale}`} leadingIcon={<item.Icon/>} aria-current={(attendance?item.href.includes('view=attendance'):item.href==='/my/wallet')?'page':undefined}>{item.label}</FanAction>)}</nav>{attendance&&<section><header id="attendance-record" className={styles.attendanceRecordHeading}><Stamp aria-hidden="true"/><h3>{a.record}</h3></header><strong>{a.earned} {data.attendance.days.reduce((sum,day)=>sum+day.points,0)}{locale==='ko'?'P':' P'}</strong>{locale==='ko'&&<p>스탬프는 패스포트에서 다시 볼 수 있어요.</p>}<FanAction href={`/passports?locale=${locale}`}>{locale==='ko'?'패스포트 보기':c.stamps}</FanAction></section>}</aside>}</div>;
}
