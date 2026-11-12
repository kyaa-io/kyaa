"use client";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { ChevronRight, Heart } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanCount } from "@/components/fan-ui/fan-count-chip";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanLoginHref } from "@/components/login-href";
import { raffleListSchema, raffleStatus, type RaffleList } from "@/features/benefit/domain/raffle";
import { benefitListResponseSchema } from "@/features/benefit/domain/benefit";
import { creatorRaffleHref, creatorRafflesHref, creatorRaffleVerificationHref } from "@/features/benefit/domain/raffle-navigation";
import type { BenefitEntryState } from "@/features/benefit/domain/benefit-entry";
import { deliveryLabel } from "@/features/benefit/ui/creator-raffles-screen";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { RankDelta } from "@/features/rankings/ui/rank-delta";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { homeCreatorRankingSchema, type HomeCreatorRankingRow } from "@/features/rankings/domain/types";
import { FavoritePickMenu } from "@/features/selected-bias/ui/selected-bias-chip";
import type { SelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import { groupBenefitsCopy } from "./group-benefits-copy";
import { seeAllLabel } from "./group-directory";
import { groupsCopy } from "./copy";
import { useGroupResource } from "./use-group-resource";
import { CapsuleMachineBlock } from "@/features/capsule-machine/capsule-machine-block";
import { LuckyStage } from "@/features/capsule-machine/lucky-stage";
import { capsuleMachineCopy } from "@/features/capsule-machine/copy";
import styles from "./stan-lucky-cheer.module.css";
import duoStyles from "./duo-lucky.module.css";

type Raffle = RaffleList["raffles"][number];
/** Tickets one entry takes (user decision 2026-11-08: set per lucky draw, 1 by default; the raffle read has no per-draw cost yet). */
export const RAFFLE_TICKET_COST = 1;
/** Stamps that fill a passport page; a full page is one heart (user decision: 9 = 1). */
export const STAMPS_PER_HEART = 9;
const LUCKY_CARDS = 2;
const parseRaffles = (value: unknown) => raffleListSchema.parse(value);
const recentRafflesSchema = z.object({ items: z.array(z.object({ raffle: raffleListSchema.shape.raffles.element, creator: z.object({ slug: z.string(), name: z.string(), image: z.string().nullable().optional() }) })) });
const parseRecentRaffles = (value: unknown) => recentRafflesSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);
const parseWallet = (value: unknown) => walletSchema.parse(value);
const parseEntries = (value: unknown) => benefitListResponseSchema.parse(value);
/** Both lucky draws and the wallet read entries for the selected celebrity. */
export function useStanEntries(locale: AppLocale, slug: string | null) {
  return useGroupResource(slug ? `/api/benefits?celebrity=${encodeURIComponent(slug)}&locale=${toContentLocale(locale)}` : null, parseEntries);
}
const t = (locale: AppLocale, key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
const shortDate = (value: string, locale: AppLocale) => new Date(value).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" });
const dayDate = (value: string, locale: AppLocale) => new Date(value).toLocaleDateString(locale, { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });
const statusOrder = { open: 0, preparing: 1, closed: 2, cancelled: 3 } as const;

/** The stamp gauge's words (사용자 결정 B, 2026-11-09 20:36): a page of 9 becomes a heart only when the fan presses 받기 on the mission book (claim API).
 * Below 9: `N칸 더 모으면 받기`; a full page (n a positive multiple of 9): `하트 받기`, the same words as the mission book's button. */
export function nextHeartLabel(locale: AppLocale, stamps: number) {
  return stamps > 0 && stamps % STAMPS_PER_HEART === 0 ? t(locale, "missionClaim") : t(locale, "cheerNextHeart", [STAMPS_PER_HEART - (stamps % STAMPS_PER_HEART)]);
}

/** The favorite whose lucky draws and rank the 덕질 tab shows: the one chosen in the header, else the followed one. */
export function stanFavorite(bias: SelectedBias) {
  return bias.selected ?? bias.unverified ?? null;
}

/** Lucky draws of the favorite, open first, then upcoming, then the latest closed; cancelled ones are left out. */
export function useStanRaffles(locale: AppLocale, slug: string | null) {
  const resource = useGroupResource(slug ? `/api/celebrities/${encodeURIComponent(slug)}/raffles?locale=${toContentLocale(locale)}` : null, parseRaffles);
  const [now, setNow] = useState(() => Date.now());
  // Re-read the status when a draw opens or closes while the screen stays open (at most a minute late).
  useEffect(() => {
    const next = (resource.data?.raffles ?? []).flatMap(raffle => [raffle.entryOpensAt, raffle.entryClosesAt]).filter((date): date is string => Boolean(date)).map(date => Date.parse(date)).filter(time => time > now);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, Math.min(60_000, ...next.map(time => time - now))));
    return () => clearTimeout(timer);
  }, [now, resource.data]);
  const items = (resource.data?.raffles ?? []).map(raffle => ({ raffle, status: raffleStatus(raffle, now) })).filter(item => item.status !== "cancelled")
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || (a.status === "closed" ? -1 : 1) * (Date.parse(a.raffle.entryClosesAt ?? "") - Date.parse(b.raffle.entryClosesAt ?? "") || 0));
  return { ...resource, items, live: items.filter(item => item.status === "open" || item.status === "preparing").length };
}

/** The favorite's row in the public creator ranking (top 20); null when the read is done and the favorite is not in it. */
/** `comparable`: the home ranking has a previous day to compare with. Without it the rank change is not drawn (same rule as the home card). */
export function useStanRank(locale: AppLocale, slug: string | null): { loading: boolean; row: HomeCreatorRankingRow | null; comparable: boolean } {
  const resource = useGroupResource(slug ? `/api/rankings/home?kind=creators&locale=${locale}` : null, parseCreators);
  return { loading: resource.loading, row: resource.data?.rows.find(row => row.slug === slug) ?? null, comparable: resource.data?.comparable === true };
}

function RaffleDate({ raffle, status, locale }: { raffle: Raffle; status: Raffle["status"]; locale: AppLocale }) {
  if (status === "preparing" && raffle.entryOpensAt) return <time dateTime={raffle.entryOpensAt}>{t(locale, "luckyOpensAt", [shortDate(raffle.entryOpensAt, locale)])}</time>;
  if (status === "open" && raffle.entryClosesAt) return <time dateTime={raffle.entryClosesAt}>{t(locale, "luckyClosesAt", [shortDate(raffle.entryClosesAt, locale)])}</time>;
  // F5: a closed card names its own close day beside the results day, so two draws of the same gift no longer read the same.
  if (status === "closed") {
    const closes = raffle.entryClosesAt ? <time dateTime={raffle.entryClosesAt}>{t(locale, "luckyClosesAt", [dayDate(raffle.entryClosesAt, locale)])}</time> : <span>{t(locale, "luckyClosed")}</span>;
    return raffle.resultsPublishedAt ? <>{closes} · <time dateTime={raffle.resultsPublishedAt}>{t(locale, "luckyResultsAt", [dayDate(raffle.resultsPublishedAt, locale)])}</time></> : closes;
  }
  return null;
}

/** What the card can promise for an open draw, with the server's entry conditions (enter_owned_benefit_v2): an active fulfillment policy,
 * the creator's passport for a standalone draw, the wallet tickets and the remaining per-fan limit. Unknown while a read is pending or failed. */
export type RaffleAllowance = { kind: "count"; count: number } | { kind: "loading" } | { kind: "unknown" } | { kind: "locked" } | { kind: "passport" } | { kind: "policy" };
export function raffleAllowance({ raffle, guest, hasPassport, tickets, entries }: {
  raffle: Raffle; guest: boolean; hasPassport: boolean;
  tickets: { loading: boolean; value: number | undefined };
  entries: { loading: boolean; error: boolean; entry: BenefitEntryState | null | undefined };
}): RaffleAllowance {
  if (guest) return { kind: "locked" };
  if (!raffle.fulfillmentPolicy) return { kind: "policy" };
  if (raffle.requiresFanVerification && (!hasPassport || entries.entry?.fanVerified === false)) return { kind: "passport" };
  if (tickets.loading || entries.loading) return { kind: "loading" };
  if (tickets.value === undefined || entries.error || entries.entry === undefined) return { kind: "unknown" };
  const remaining = entries.entry ? entries.entry.remainingBenefitTickets : raffle.perFanTicketLimit;
  return { kind: "count", count: Math.max(0, Math.min(Math.floor(tickets.value / RAFFLE_TICKET_COST), remaining ?? Number.POSITIVE_INFINITY)) };
}

function raffleHref(slug: string, benefitId: string | null, locale: AppLocale): string {
  if (benefitId) return creatorRaffleHref(slug, benefitId, locale);
  return creatorRafflesHref(slug, locale);
}

/** One lucky-draw card (E4): prize, date, winners, ticket cost with the entries the server would take now, and one action that always works.
 * When the server would refuse (no passport, no fulfillment policy yet) the card says why and leads to the fix instead of a count. */
function RaffleCard({ raffle, status, slug, locale, entered, allowance }: { raffle: Raffle; status: Raffle["status"]; slug: string; locale: AppLocale; entered: number | null; allowance: RaffleAllowance | null }) {
  const open = status === "open" && allowance !== null;
  const cost = !open ? null
    : allowance.kind === "locked" ? <>{t(locale, "luckyCostGuest", [RAFFLE_TICKET_COST])} · <FanLockedValue locale={locale} /></>
    : allowance.kind === "loading" ? <FanSkeleton width={160} height={20} />
    : allowance.kind === "count" ? t(locale, "luckyCost", [RAFFLE_TICKET_COST, allowance.count.toLocaleString(locale)])
    : allowance.kind === "passport" ? t(locale, "luckyNeedPassport")
    : allowance.kind === "policy" ? t(locale, "luckyNeedPolicy")
    : t(locale, "luckyCostGuest", [RAFFLE_TICKET_COST]);
  const passport = open && allowance.kind === "passport";
  const href = passport ? creatorRaffleVerificationHref(slug, locale, raffle.benefitId) : raffleHref(slug, raffle.benefitId, locale);
  const label = passport ? t(locale, "luckyGetPassport") : status === "open" && allowance?.kind !== "policy" ? t(locale, "luckyEnter") : status === "closed" ? t(locale, "luckyResults") : t(locale, "luckyDetails");
  return <li className={styles.raffle} data-raffle-status={status} data-raffle-allowance={open ? allowance.kind : undefined}>
    <span className={styles.prize}>{raffle.imageUrl ? <img src={raffle.imageUrl} alt="" width={80} height={60} loading="lazy" /> : <RewardIcon kind="ticket" alt="" width={32} height={32} data-fallback="" />}</span>
    <span className={styles.raffleHead}><strong className={styles.raffleTitle}>{raffle.title}</strong><span className={styles.meta}><RaffleDate raffle={raffle} status={status} locale={locale} /></span></span>
    <span className={styles.facts}>
      <span className={styles.meta}>{t(locale, "luckyWinners", [raffle.winnerQuantity.toLocaleString(locale)])} · {deliveryLabel(raffle, locale)}{entered ? <> · {t(locale, "luckyMyEntries", [entered.toLocaleString(locale)])}</> : null}</span>
      {cost ? <span className={styles.cost} data-raffle-cost="">{cost}</span> : null}
    </span>
    <FanAction variant="secondary" size="sm" fullWidth href={href} className={styles.action}>{label}</FanAction>
  </li>;
}

/** 럭키드로우 (E4): the favorite's real lucky draws instead of placeholder cards. No disabled action; an upcoming draw opens its gift page. */
/** `paused`: the draw is resting (CAPSULE_DRAW_OPEN false). Only the duo card reads it: its enter button stays disabled with the reason; everything else on the card is live. */
export function StanLucky({ locale, bias, guest, presentation, paused = false }: { locale: AppLocale; bias: SelectedBias; guest: boolean; presentation?: "duo"; paused?: boolean }) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug ?? null;
  const raffles = useStanRaffles(locale, slug), title = groupBenefitsCopy(locale).lucky;
  const hasPast = raffles.items.some(item => item.status === "closed");
  const recent = useGroupResource(presentation === "duo" && (!slug || (!raffles.loading && !raffles.error && !hasPast)) ? `/api/raffles/recent?locale=${toContentLocale(locale)}` : null, parseRecentRaffles);
  const wallet = useGroupResource(!guest && slug ? "/api/me/wallet" : null, parseWallet);
  const entries = useStanEntries(locale, !guest ? slug : null);
  // F5: open and upcoming draws take the first place; closed ones only fill a separate 지난 럭키드로우 list when none is live.
  const live = raffles.items.filter(item => item.status !== "closed"), past = live.length ? [] : raffles.items.filter(item => item.status === "closed");
  const shown = live.slice(0, LUCKY_CARDS), shownPast = past.slice(0, LUCKY_CARDS);
  const more = slug && raffles.items.length > shown.length + shownPast.length ? <FanSectionLink className={styles.headLink} href={creatorRafflesHref(slug, locale)}>{seeAllLabel[locale]}</FanSectionLink> : null;
  if (presentation === "duo") {
    const item = live.find(item => item.status === "open") ?? live[0];
    const entry = entries.data ? entries.data.benefits.find(row => row.id === item?.raffle.benefitId)?.entry ?? null : undefined;
    const allowance = item?.status === "open" ? raffleAllowance({ raffle:item.raffle, guest, hasPassport:bias.selected?.slug===slug, tickets:{ loading:wallet.loading,value:wallet.data?.tickets }, entries:{ loading:entries.loading,error:entries.error,entry } }) : null;
    const passport = allowance?.kind === "passport";
    const href = item && slug ? passport ? creatorRaffleVerificationHref(slug,locale,item.raffle.benefitId) : raffleHref(slug,item.raffle.benefitId,locale) : `/my/raffles?locale=${locale}`;
    const amountToken = "__DUO_AMOUNT__";
    const costParts = allowance?.kind === "count" ? t(locale,"luckyCost",[RAFFLE_TICKET_COST,amountToken]).split(amountToken) : null;
    const pending = bias.status === "loading" || Boolean(slug && raffles.loading), empty = !pending && !raffles.error && (!item || !slug);
    const ready = !pending && !raffles.error && !empty;
    // C4: 쉬는 동안(paused)에는 상태와 상관없이 응모 버튼 하나만 비활성으로 두고 이유를 붙인다. href·onClick이 없어 요청을 만들지 않는다.
    const action = paused || (ready && item) ? <FanAction className={duoStyles.action} variant="primary" {...(paused ? { disabled: true, helperText: capsuleMachineCopy(locale).text("soon") } : { href })}>
      {paused || (item?.status === "open" && allowance?.kind !== "policy" && !passport) ? t(locale,"luckyEnter") : passport ? t(locale,"luckyGetPassport") : t(locale,"luckyDetails")}</FanAction> : null;
    const pastItems = hasPast && slug && favorite ? raffles.items.filter(row => row.status === "closed").slice(0, 3).map(({ raffle }) => ({ raffle, creator: { slug, name: favorite.name, image: (favorite as { image?: string | null }).image ?? null } })) : recent.data?.items ?? [];
    return <div className={duoStyles.layout} data-has-past={pastItems.length ? "" : undefined}>
    <section className={duoStyles.card} id="stan-lucky" aria-label={title} data-duo-lucky data-lucky-module="" data-lucky-paused={paused ? "" : undefined} data-raffle-status={item?.status}>
      <LuckyStage className={duoStyles.stage} paused={paused} locale={locale} />
      <div className={duoStyles.copy}>
        <img className={duoStyles.glyph} src="/images/dukjil-duo/glyph-illo-lucky-80.webp" width={40} height={40} alt="" />
        {paused ? <><FanTag tone="neutral" className={duoStyles.badge}>{capsuleMachineCopy(locale).text("soon")}</FanTag><FanHeading>{locale === "ko" ? "다음 럭키드로우를 준비 중이에요." : t(locale,"luckyEmpty")}</FanHeading></> : pending ? <div aria-busy="true"><FanSkeleton width="80%" height={22}/><FanSkeleton width="60%" height={17}/></div>
          : raffles.error ? <FanState inline compact kind="error" title={t(locale,"luckyLoadError")} actions={<FanAction variant="text" onClick={raffles.retry}>{groupsCopy(locale).retry}</FanAction>}/>
          : empty || !item ? <p className={duoStyles.emptyText}>{t(locale,slug ? "luckyEmpty" : "luckyNoFavorite")}</p>
          : <><FanTag tone="neutral" className={duoStyles.badge}>{capsuleMachineCopy(locale).text(item.status === "open" ? "open" : "soon")}{item.status === "open" && item.raffle.entryClosesAt ? ` · D-${Math.max(0, Math.ceil((Date.parse(item.raffle.entryClosesAt) - Date.now()) / 86400000))}` : ""}</FanTag><FanHeading>{item.raffle.title}</FanHeading><p className={duoStyles.meta}><RaffleDate raffle={item.raffle} status={item.status} locale={locale}/> · {t(locale,"luckyWinners",[item.raffle.winnerQuantity.toLocaleString(locale)])} · {deliveryLabel(item.raffle,locale)}</p>
            <p className={duoStyles.cost} data-raffle-cost data-raffle-allowance={allowance?.kind}>{costParts && allowance?.kind === "count" ? <>{costParts[0]}<strong>{allowance.count.toLocaleString(locale)}</strong>{costParts[1]}</> : allowance?.kind === "loading" ? <FanSkeleton width={160} height={24}/> : allowance?.kind === "passport" ? t(locale,"luckyNeedPassport") : allowance?.kind === "policy" ? t(locale,"luckyNeedPolicy") : t(locale,"luckyCostGuest",[RAFFLE_TICKET_COST])}</p></>}
      </div>
      {action ? <div className={duoStyles.actionBlock}>{action}</div> : null}
    </section>
    {pastItems.length === 0 && slug ? <FanSectionLink className={duoStyles.past} href={creatorRafflesHref(slug, locale)}>{t(locale, "luckyPast")}</FanSectionLink> : null}
    {pastItems.length > 0 && <section className={duoStyles.pastList} aria-label={t(locale, "luckyPast")} data-lucky-past>
      <FanHeading>{t(locale, "luckyPast")}</FanHeading>
      <div className={duoStyles.pastRows}>{pastItems.slice(0, 3).map(({ raffle, creator }) => <Link key={raffle.id} href={raffleHref(creator.slug, raffle.benefitId, locale)} className={duoStyles.pastCard}>
        {raffle.imageUrl || creator.image ? <img className={duoStyles.thumbnail} src={(raffle.imageUrl || creator.image)!} alt="" width={112} height={112} loading="lazy" /> : null}
        <div className={duoStyles.pastCopy}><FanText role="item" as="strong">{raffle.title}</FanText><p className={duoStyles.meta}>{creator.name}{raffle.entryClosesAt ? <> · {t(locale, "luckyClosesAt", [dayDate(raffle.entryClosesAt, locale)])}</> : null}</p></div>
        <FanText role="label" className={duoStyles.resultLink}>{locale === "ko" ? "당첨 결과 보기" : t(locale, "luckyResults")} ›</FanText>
      </Link>)}</div>
    </section>}
    </div>;
  }
  // 게이트 D2: the empty state is one line; its next step is a row below it inside the same box, ending in ›.
  const empty = (title: string, action?: ReactNode, short = false) => <div className={short ? `${styles.empty} ${styles.emptyShort}` : styles.empty}><div className={styles.emptyLine}><FanState kind="empty" title={title} /></div>{action}</div>;
  const history = <Link className={styles.emptyRow} href={`/my/raffles?locale=${locale}` as Route}><span>{t(locale, "luckyHistory")}</span><ChevronRight size={16} aria-hidden="true" /></Link>;
  const body = bias.status === "loading" || (slug && raffles.loading) ? <div className={styles.pending} aria-busy="true"><FanSkeleton shape="block" width="100%" height="100%" /></div>
    : guest ? empty(t(locale, "luckyNoFavorite"))
    // H1 (DS-D review): picking a favorite is offered once, in the cheer block; here the line only says what will show.
    : !slug ? empty(t(locale, "luckyNoFavorite"))
    : raffles.error ? <FanState inline compact kind="error" className={styles.empty} title={t(locale, "luckyLoadError")} actions={<FanAction variant="text" onClick={raffles.retry}>{groupsCopy(locale).retry}</FanAction>} />
    : shown.length === 0 && shownPast.length === 0 ? empty(t(locale, "luckyEmpty"), history)
    : shown.length === 0 ? <>{empty(t(locale, "luckyEmpty"), history, true)}
      <p className={styles.pastHead} id="stan-lucky-past">{t(locale, "luckyPast")}</p>
      <ul className={styles.raffles} data-count={shownPast.length} data-raffle-list="past" aria-labelledby="stan-lucky-past">{shownPast.map(({ raffle, status }) => {
        const entry = entries.data?.benefits.find(item => item.id === raffle.benefitId)?.entry ?? null;
        return <RaffleCard key={raffle.id} raffle={raffle} status={status} slug={slug} locale={locale} entered={entry?.enteredTickets ?? null} allowance={null} />;
      })}</ul></>
    : <ul className={styles.raffles} data-count={shown.length}>{shown.map(({ raffle, status }) => {
      // A loaded list without this benefit means no entry yet (entered 0); undefined while the list is not known.
      const entry = entries.data ? entries.data.benefits.find(item => item.id === raffle.benefitId)?.entry ?? null : undefined;
      const allowance = status === "open" ? raffleAllowance({ raffle, guest, hasPassport: bias.selected?.slug === slug, tickets: { loading: wallet.loading, value: wallet.data?.tickets }, entries: { loading: entries.loading, error: entries.error, entry } }) : null;
      return <RaffleCard key={raffle.id} raffle={raffle} status={status} slug={slug} locale={locale} entered={entry?.enteredTickets ?? null} allowance={allowance} />;
    })}</ul>;
  return <section className={styles.section} id="stan-lucky" tabIndex={-1} aria-labelledby="stan-lucky-title">
    <div className={styles.head}><FanHeading id="stan-lucky-title">{title}</FanHeading><FanCount value={raffles.live} />{more}</div>
    <CapsuleMachineBlock locale={locale} guest={guest} />
    {body}
  </section>;
}

/** 응모 결과 빈 상태(대표 02:08 "너무 썰렁해서"): 최애의 진행 중·지난 럭키드로우를 덕질과 같은 카드로 채운다. 읽는 중이거나 실제 목록이 없으면 아무것도 그리지 않는다. */
export function StanRaffleLists({ locale, bias, className }: { locale: AppLocale; bias: SelectedBias; className?: string }) {
  // 최애를 아직 고르지 않았으면 패스포트를 가진 첫 크리에이터의 목록을 보여준다.
  const slug = (stanFavorite(bias) ?? bias.options[0])?.slug ?? null;
  const raffles = useStanRaffles(locale, slug), entries = useStanEntries(locale, slug);
  if (!slug || raffles.loading || raffles.error) return null;
  const live = raffles.items.filter(item => item.status !== "closed"), past = raffles.items.filter(item => item.status === "closed").slice(0, 4);
  const list = (items: typeof live, id: string, heading: string, kind: string) => items.length === 0 ? null : <section className={styles.listSection} aria-labelledby={id}>
    <p className={styles.pastHead} id={id}>{heading}</p>
    <ul className={styles.raffles} data-count={items.length} data-raffle-list={kind}>{items.map(({ raffle, status }) => {
      const entry = entries.data?.benefits.find(item => item.id === raffle.benefitId)?.entry ?? null;
      return <RaffleCard key={raffle.id} raffle={raffle} status={status} slug={slug} locale={locale} entered={entry?.enteredTickets ?? null} allowance={null} />;
    })}</ul>
  </section>;
  const lists = [list(live, "my-raffles-live", groupBenefitsCopy(locale).lucky, "live"), list(past, "my-raffles-past", t(locale, "luckyPast"), "past")].filter(Boolean);
  return lists.length ? <div className={className} data-my-raffle-lists="">{lists}</div> : null;
}

/** 최애 응원 (E4, user decision: cheering spends nothing): my hearts already count toward the favorite's rank, so the card shows that rank,
 * my share and the way to the fan ranking. No send button. F2: the stamps to the next heart live in the wallet's stamp cell only (one value, one shape). */
export function StanCheer({ locale, bias, guest, hearts }: { locale: AppLocale; bias: SelectedBias; guest: boolean; hearts: number | null }) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug ?? null, title = t(locale, "stanFlowCheer");
  const rank = useStanRank(locale, slug), selected = bias.selected && bias.selected.slug === slug ? bias.selected : null;
  const login = fanLoginHref(locale, `/benefits?locale=${locale}`);
  const pickInner = <><img src="/images/groups/join-community-20261112.webp" alt="" width={40} height={40} /><span className={styles.name}>{t(locale, "heartPick")}</span><ChevronRight size={16} aria-hidden="true" /></>;
  const head = bias.status === "loading" ? <span className={styles.who}><FanSkeleton shape="circle" width={40} height={40} /><FanSkeleton width={120} height={20} /></span>
    : guest ? <span className={styles.who}><span className={styles.avatarIcon}><Heart size={20} aria-hidden="true" /></span><span className={styles.whoText}><FanLockedValue locale={locale} /></span></span>
    : !favorite ? (bias.options.length ? <FavoritePickMenu locale={locale} bias={bias} className={styles.who}>{pickInner}</FavoritePickMenu> : <Link className={styles.who} href={`/pages/groups?locale=${locale}` as Route}>{pickInner}</Link>)
    : <Link className={styles.who} href={`/${encodeURIComponent(favorite.slug)}?locale=${locale}` as Route}>
      {selected ? <img className={styles.avatar} src={selected.image} alt="" width={40} height={40} style={selected.imagePosition ? { objectPosition: selected.imagePosition } : undefined} /> : <span className={styles.avatarIcon}><Heart size={20} aria-hidden="true" /></span>}
      <span className={styles.whoText}><span className={styles.name}>{favorite.name}</span>
        <span className={styles.rank}>{rank.loading ? <FanSkeleton width={120} height={16} /> : rank.row ? <>{t(locale, "cheerRank", [rank.row.rank])}{rank.comparable ? <RankDelta delta={rank.row.delta} locale={locale} /> : null}</> : t(locale, "cheerRankOut")}</span></span>
    </Link>;
  const heartIcon = <Heart size={20} strokeWidth={1.75} className={styles.heart} aria-hidden="true" />;
  return <section className={styles.section} id="stan-cheer" tabIndex={-1} aria-labelledby="stan-cheer-title">
    <div className={`${styles.head} ${styles.plainHead}`}><FanHeading id="stan-cheer-title">{title}</FanHeading></div>
    <div className={styles.cheer} data-cheer={guest ? "guest" : favorite ? "favorite" : "pick"}>
      {head}
      <dl className={styles.numbers}>
        <div><dt>{t(locale, "cheerMyHearts")}</dt><dd>{guest ? <FanLockedValue locale={locale} /> : hearts === null ? <FanSkeleton width={48} height={24} /> : <FanNumber value={hearts} size="lg" countUp locale={locale} icon={heartIcon} />}</dd></div>
        {rank.row ? <div><dt>{rankingsText(locale, "rkCumulativeFans")} · {rankingsText(locale, "rkCumulativeHearts")}</dt><dd className={styles.community}>{rank.row.score.toLocaleString(locale)} · {heartIcon}{rank.row.hearts.toLocaleString(locale)}</dd></div> : null}
      </dl>
      {/* H1: without a favorite the pick row above is the one way to choose; the button stays for the fan ranking and the guest login. */}
      {guest || slug ? <FanAction variant="secondary" size="sm" fullWidth className={styles.action} href={guest ? `/pages/groups?locale=${locale}` : `/${encodeURIComponent(slug!)}?tab=fans&locale=${locale}`}>{guest ? t(locale, "heartPick") : t(locale, "cheerFanRanking")}</FanAction> : null}
    </div>
  </section>;
}
