"use client";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Coins, Gift, Heart, Plus, Ticket, UserPlus } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton, FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { resolveCreatorHeroImage } from "@/components/fan-ui/creator-image-config";
import { fanLoginHref } from "@/components/login-href";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { parseDukjilAttendanceList, streakCells, streakBandPage } from "@/features/dukjil/domain/dukjil-ui";
import { JOINED_PAGES_PATH, attendanceListPath } from "@/features/dukjil/ui/use-attended-anywhere";
import { fanCommunitySchema } from "@/features/fanpage/domain/fan-community";
import { leaderboardSchema } from "@/features/fanpage/domain/community";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { walletHistoryLabel } from "@/features/group-wallet/ui/history-label";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { fanStageLabel, fanTierEntryKey } from "@/features/rewards/domain/fan-stage";
import { FavoritePickMenu } from "@/features/selected-bias/ui/selected-bias-chip";
import type { SelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { historySchema } from "@/server/group-wallet/domain";
import { sortedFansSchema } from "@/server/group-members/sorted-domain";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { groupDetailSchema, groupListSchema } from "../domain/contracts";
import { groupBenefitsCopy } from "./group-benefits-copy";
import { groupMembersCopy } from "./group-members-copy";
import { seeAllLabel } from "./group-directory";
import { groupsCopy } from "./copy";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "./use-group-resource";
import { stanFavorite, useStanRank } from "./stan-lucky-cheer";
import styles from "./duo-profile.module.css";

const parseCommunity = (v: unknown) => fanCommunitySchema.parse(v);
const parsePage = (v: unknown) => groupDetailSchema.parse(v);
const parseFans = (v: unknown) => sortedFansSchema.parse(v);
const parseRanking = (v: unknown) => leaderboardSchema.parse(v);
const parseJoined = (v: unknown) => groupListSchema.parse(v);
const parseHistory = (v: unknown) => historySchema.parse(v);
const fallbackAvatar = "/images/avatars/fairy-cream.webp";
type Props = { locale: AppLocale; bias: SelectedBias; guest: boolean };

function DuoGuestPrompt({ locale }: { locale: AppLocale }) {
  return <div className={styles.guestPrompt} role="status"><FanLockedValue locale={locale} /><FanAction variant="secondary" href={fanLoginHref(locale, `/benefits?locale=${locale}`)}>{walletCopy(locale).login}</FanAction></div>;
}

export function DuoProfile({ locale, bias, guest }: Props) {
  const favorite = guest ? null : stanFavorite(bias), selected = bias.selected, slug = favorite?.slug;
  const fans = useGroupResource(slug ? `/api/celebrities/${encodeURIComponent(slug)}/fans?locale=${toContentLocale(locale)}` : null, parseCommunity);
  const rank = useStanRank(locale, slug ?? null), w = walletCopy(locale);
  const image = selected?.image, hero = image && slug ? resolveCreatorHeroImage(slug, { url: image, position: selected.imagePosition ?? "50% 50%" }) : null;
  // R2's approved fallback is the existing opaque photograph of this same capsule machine.
  const machine = image === "/images/groups/capsule-machine.png";
  const cover = machine ? "/images/groups/capsule-machine-reveal-poster.webp" : hero?.src;
  const grade = selected ? fanStageLabel(locale, { tier: selected.tier, subdivision: selected.stage?.subdivision ?? Number(fanTierEntryKey(selected.tier).split("-").at(-1)) }) : null;
  const pick = <><Plus size={24} strokeWidth={1.5} aria-hidden="true" />{dukjilText(locale, "heartPick")} <span aria-hidden="true">›</span></>;
  if (guest) return <section className={`${styles.profile} ${styles.guestProfile}`} data-duo-profile><FanHeading variant="personal-page">{dukjilText(locale, "heartPick")}</FanHeading><FanAction variant="primary" href={fanLoginHref(locale, `/benefits?locale=${locale}`)}>{w.login}</FanAction></section>;
  return <section className={styles.profile} data-duo-profile>
    <div className={styles.cover} data-machine={machine || undefined}>{cover ? <picture><source media="(max-width:1023px)" srcSet={machine ? cover : hero?.mobileSrc ?? cover} /><img src={cover} alt="" style={{ "--duo-cover-position": hero?.desktopPosition, "--duo-cover-mobile-position": hero?.mobilePosition } as CSSProperties} /></picture> : <span className={styles.coverEmpty} aria-hidden="true" />}</div>
    <div className={styles.identity}>
      <div className={styles.avatar}>{image && !guest ? <img src={image} alt="" width={96} height={96} style={{ "--duo-avatar-position": selected.imagePosition } as CSSProperties} /> : !guest ? <Plus size={24} strokeWidth={1.5} aria-hidden="true" /> : null}</div>
      <div className={styles.identityText}>{bias.status === "loading" ? <FanSkeleton width={240} height={31} /> : favorite ? <FanHeading variant="personal-page">{favorite.name}</FanHeading> : bias.options.length ? <FavoritePickMenu locale={locale} bias={bias} className={styles.pick}>{pick}</FavoritePickMenu> : <Link className={styles.pick} href={`/pages/groups?locale=${locale}` as Route}>{pick}</Link>}
        {favorite && <><p className={styles.sub}>{grade}{grade && " · "}{rank.loading ? <FanSkeleton width={120} height={16} /> : dukjilText(locale, rank.row ? "cheerRank" : "cheerRankOut", rank.row ? [rank.row.rank] : undefined)}</p>
          <Link className={styles.fanCount} href={`/${encodeURIComponent(favorite.slug)}?tab=fans&locale=${locale}` as Route}>{fans.data ? rankingsText(locale, "rkJjinfanCount", [fans.data.fanCount.toLocaleString(locale)]) + (locale === "ko" ? "명" : "") : fans.error ? groupsCopy(locale).error : <FanSkeleton width={80} height={23} />}</Link></>}
      </div>
    </div>
  </section>;
}

/** The existing public-people read supplies per-fan hearts; no invented values or joins by nickname. */
export function DuoFanRail({ locale, bias, guest }: Props) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug;
  const [tab, setTab] = useState("fans"), c = groupMembersCopy(locale);
  const page = useGroupResource(slug ? `/api/groups/resolve/${encodeURIComponent(slug)}` : null, parsePage);
  const fans = useGroupResource(page.data ? `/api/groups/${page.data.page.id}/public-people?sort=hearts&mode=jjinfans&limit=5&locale=${locale}` : null, parseFans);
  const ranking = useGroupResource(slug && tab === "ranking" ? `/api/celebrities/${encodeURIComponent(slug)}/leaderboard?locale=${toContentLocale(locale)}` : null, parseRanking);
  const fanBody = guest ? <DuoGuestPrompt locale={locale} /> : !slug ? <FanState inline kind="empty" title={dukjilText(locale, "luckyNoFavorite")} />
    : page.error || fans.error ? <FanState inline compact kind="error" title={c.error} actions={<FanAction variant="text" onClick={() => { page.retry(); fans.retry(); }}>{c.retry}</FanAction>} />
    : page.loading || fans.loading || !fans.data ? <FanSkeletonRows rows={5} />
    : <ul className={styles.fans}>{Array.from({ length:5 }, (_, i) => { const fan = fans.data?.items[i]; return <li data-row key={i} className={styles.fanRow} data-duo-fan-row>{fan ? <><span>{i+1}</span><img src={fan.avatarUrl ?? fallbackAvatar} alt="" width={40} height={40} /><strong>{fan.nickname}</strong><span className={styles.hearts}><Heart size={16} strokeWidth={1.5} aria-hidden="true" />{fan.hearts.toLocaleString(locale)}</span></> : i === 0 ? <span className={styles.emptyRow}>{c.empty}</span> : <span className={styles.placeholder} aria-hidden="true" />}</li>; })}</ul>;
  const rankBody = guest ? <DuoGuestPrompt locale={locale} /> : !slug ? <FanState inline kind="empty" title={dukjilText(locale, "luckyNoFavorite")} />
    : ranking.error ? <FanState inline compact kind="error" title={c.error} actions={<FanAction variant="text" onClick={ranking.retry}>{c.retry}</FanAction>} />
    : ranking.loading || !ranking.data ? <FanSkeletonRows rows={5} />
    : !ranking.data.available ? <FanState inline kind="empty" title={c.threshold} />
    : <ul className={styles.fans}>{Array.from({ length:5 }, (_, i) => { const fan = ranking.data?.rows[i]; return <li data-row key={i} className={styles.fanRow}>{fan ? <><span>{fan.rank}</span><img src={fan.avatarUrl ?? fallbackAvatar} alt="" width={40} height={40} /><strong>{fan.nickname}</strong><span aria-label={c.points}>{fan.points.toLocaleString(locale)}P</span></> : <span className={styles.placeholder} aria-hidden="true" />}</li>; })}</ul>;
  return <section className={styles.rail} id="stan-cheer" aria-label={dukjilText(locale, "stanFlowCheer")} data-duo-rail data-guest={guest || undefined}>
    <FanTabs panels className={styles.tabs} label={c.title} current={tab} items={[
      { key:"fans", label:rankingsText(locale, "rkJjinfanShort"), onSelect:()=>setTab("fans"), panel:<div className={styles.railBody}>{fanBody}</div> },
      { key:"ranking", label:locale === "ko" ? "팬 순위" : c.ranking, onSelect:()=>setTab("ranking"), panel:<div className={styles.railBody}>{rankBody}</div> },
    ]} />
  </section>;
}

type Failure = (failed: boolean, retry: () => void) => void;
export function DuoStreak({ locale, bias, guest, onFailure }: Props & { onFailure?: Failure }) {
  const list = useGroupResource(!guest ? JOINED_PAGES_PATH : null, parseJoined);
  const creators = (list.data?.items ?? []).filter(page => page.celebrityId && page.slug).slice(0,50);
  const slugs = creators.map(page => encodeURIComponent(page.slug!)).join(",");
  const attendance = useGroupResource(slugs ? attendanceListPath(slugs) : null, parseDukjilAttendanceList);
  const failed = Boolean(list.error || attendance.error), loading = list.loading || attendance.loading;
  const callbacks = useRef({ onFailure, retry:()=>{ list.retry(); attendance.retry(); } });
  callbacks.current = { onFailure, retry:()=>{ list.retry(); attendance.retry(); } };
  useEffect(()=>{ if(!loading) callbacks.current.onFailure?.(failed,()=>callbacks.current.retry()); },[failed,loading]);
  const byId = new Map(attendance.data?.items.map(item => [item.celebrityId,item]));
  const chosen = creators.find(page => page.slug === bias.selected?.slug) ?? streakBandPage(creators, page => byId.get(page.celebrityId!)?.streak ?? 0);
  const item = chosen ? byId.get(chosen.celebrityId!) : undefined;
  const cells = item ? streakCells(item.streak,item.attendedToday,item.nextBonusIn) : null;
  return <section className={styles.today} aria-label={dukjilText(locale,"dukjilTodayTitle")} data-duo-today><FanHeading>{dukjilText(locale,"dukjilTodayTitle")}</FanHeading>
    <div className={styles.streak} data-streak-band>{guest ? <FanLockedValue locale={locale} /> : failed ? <FanState inline compact kind="error" title={dukjilText(locale,"dukjilLoadError")} actions={<FanAction variant="text" onClick={()=>callbacks.current.retry()}>{walletCopy(locale).retry}</FanAction>} /> : loading ? <FanSkeleton width="100%" height={24} /> : item && chosen ? <>
      <span className={styles.streakOwner}>{chosen.imageUrl && <img src={chosen.imageUrl} alt="" width={28} height={28} />}<strong>{dukjilText(locale,"dukjilStreak",[item.streak])}</strong></span>
      <span className={styles.days} aria-hidden="true">{Array.from({length:7},(_,i)=><span className={styles.day} key={i} data-state={i < cells!.filled ? "past" : i === cells!.todayIndex ? "today" : "next"}>{i < cells!.filled ? <Check size={24} strokeWidth={1.5} /> : i === 6 ? <Gift size={24} strokeWidth={1.5} /> : null}</span>)}</span>
    </> : <span>{dukjilText(locale,"dukjilListEmpty")}</span>}</div>
  </section>;
}

/** Absolute KST date plus time identifies otherwise identical ledger entries. */
export function duoHistoryDate(value: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(value));
  const get = (type: string) => p.find(part => part.type === type)?.value;
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

export function DuoHistory({ locale, guest, onFailure }: { locale: AppLocale; guest: boolean; onFailure?: Failure }) {
  const history = useGroupResource(guest ? null : "/api/me/wallet/history", parseHistory), w = walletCopy(locale);
  const callbacks = useRef({ onFailure, retry:history.retry }); callbacks.current = { onFailure, retry:history.retry };
  useEffect(()=>{ if(!history.loading) callbacks.current.onFailure?.(history.error,()=>callbacks.current.retry()); },[history.error,history.loading]);
  useEffect(()=>{ window.addEventListener(GROUP_WALLET_CHANGED_EVENT,history.retry); return ()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,history.retry); },[history.retry]);
  return <section className={styles.history} id="stan-history" aria-label={groupBenefitsCopy(locale).historyLink} data-duo-history data-guest={guest || undefined}>
    <div className={styles.historyHead}><FanHeading>{groupBenefitsCopy(locale).historyLink}</FanHeading><Link href={`/my/wallet?locale=${locale}` as Route}>{seeAllLabel[locale]} <span aria-hidden="true">›</span></Link></div>
    <div className={styles.historyBody}>{guest ? <DuoGuestPrompt locale={locale} /> : history.error ? <FanState inline compact kind="error" title={w.error} actions={<FanAction variant="text" onClick={history.retry}>{w.retry}</FanAction>} /> : history.loading ? <FanSkeletonRows rows={3} /> : <ul>{Array.from({length:3},(_,i)=>{ const entry = history.data?.entries[i]; return <li data-row key={entry?.id ?? i} className={styles.historyRow}>{entry ? <>
      {entry.asset === "ticket" || entry.asset === "support_voucher" ? <Ticket size={20} strokeWidth={1.5} aria-hidden="true" /> : <Coins size={20} strokeWidth={1.5} aria-hidden="true" />}<span><strong>{walletHistoryLabel(locale,entry.sourceType,entry)}</strong><time dateTime={entry.createdAt}>{duoHistoryDate(entry.createdAt)}</time></span><strong>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString(locale)}{entry.asset === "fan_point" ? "P" : w.tickets}</strong>
    </> : i===0 ? <span className={styles.emptyRow}>{w.empty}</span> : <span className={styles.placeholder} aria-hidden="true" />}</li>; })}</ul>}</div>
    <Link className={styles.invite} href={`/my/invitations?locale=${locale}` as Route}><UserPlus size={24} strokeWidth={1.5} aria-hidden="true" /><strong>{dukjilText(locale,"dukjilTileInvite")}</strong><span aria-hidden="true">›</span></Link>
  </section>;
}
