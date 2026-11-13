"use client";

import { useEffect, type ReactNode } from "react";
import { CalendarCheck } from "@/components/fan-ui/fan-icons";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanText } from "@/components/fan-ui/fan-text";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { walletSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import type { MySummary } from "../domain/my-summary";
import { myHomeText } from "./my-home-copy";
import { passportTierName, usePassportBook } from "./my-passport-card";
import styles from "./my-stats.module.css";

type Passport = NonNullable<MySummary["creators"][number]["passport"]>;
/** loading: still reading · missing: the read failed (a dash, never a made-up number). */
type Slot = "loading" | "missing" | number;

const parseWallet = (value: unknown) => walletSchema.parse(value);
const COMPACT_FROM = 10_000;

function Value({ locale, slot, unit }: { locale: AppLocale; slot: Slot; unit?: string }) {
  if (slot === "loading") return <FanSkeleton width={48} height={24} />;
  if (slot === "missing") return <FanText role="item" className={styles.muted}>—</FanText>;
  // From 10,000 the short form (1.2만, 12.3K) keeps every cell on its line; 덕질 keeps the exact number. The short word rides in the unit.
  if (slot >= COMPACT_FROM) {
    const parts = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).formatToParts(slot);
    const short = Number(parts.filter((part) => ["integer", "decimal", "fraction"].includes(part.type)).map((part) => part.type === "decimal" ? "." : part.value).join(""));
    const word = parts.filter((part) => part.type === "compact" || part.type === "literal").map((part) => part.value).join("").trim();
    return <FanNumber size="lg" value={short} locale={locale} unit={`${word}${unit ?? ""}`} />;
  }
  return <FanNumber size="lg" value={slot} countUp locale={locale} unit={unit} />;
}

/** Stamps read like the passport card below and the 덕질 heart exchange: stamped slots of the mission-book page being filled, out of its slots. */
function StampValue({ locale, passport, fallback }: { locale: AppLocale; passport: Passport | null | "loading"; fallback: Slot }) {
  const book = usePassportBook(passport && passport !== "loading" ? passport.id : null);
  if (passport === "loading") return <Value locale={locale} slot="loading" />;
  // No passport yet (or the mission book switched off): every stamp the fan holds, as in 스탬프 기록 below.
  if (passport === null || book.status === "off") return <Value locale={locale} slot={fallback} unit={locale === "ko" ? "개" : undefined} />;
  if (book.status === "error") return <Value locale={locale} slot="missing" />;
  if (!book.page) return <Value locale={locale} slot="loading" />;
  return <FanNumber size="lg" value={book.page.filled} countUp locale={locale} unit={`/${book.page.slots.length}`} />;
}

function Cell({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className={styles.cell}>
    <dt className={styles.label}><span className={styles.icon} aria-hidden="true">{icon}</span><FanText role="meta" className={styles.name}>{label}</FanText></dt>
    <dd className={styles.value}>{children}</dd>
  </div>;
}

/** MY 내 통계 (대표 11/14 00:07): the numbers the header chip stands for, read-only and in one card — tier, hearts, points, tickets,
 *  stamps and the check-in streak. Exchanging and missions stay in 덕질; this card has no buttons. Values come from /api/me/wallet
 *  (points, tickets, streak) and the MY summary the screen already holds (tier, hearts, stamps). `passport` is the passport MY shows
 *  (the named favorite, or the default one); null means the fan has none yet, so the tier reads 없음 and hearts 0. */
export function MyStatsCard({ locale, passport, stamps }: { locale: AppLocale; passport: Passport | null | "loading"; stamps: Slot }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet);
  const { retry } = wallet;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  const w = walletCopy(locale), ko = locale === "ko";
  const read = (pick: (data: NonNullable<typeof wallet.data>) => number): Slot => wallet.data ? pick(wallet.data) : wallet.error ? "missing" : "loading";
  const hearts: Slot = passport === "loading" ? "loading" : passport === null ? 0 : passport.hearts ?? "missing";
  return <section className={styles.card} aria-labelledby="my-stats-title" data-block="my-stats">
    <FanHeading id="my-stats-title">{myHomeText(locale, "statsTitle")}</FanHeading>
    <dl className={styles.grid}>
      <Cell label={myHomeText(locale, "tierLabel")} icon={passport && passport !== "loading" ? <FanTierBadge tier={passport.tier} stageKey={passport.stageProgress?.current.key} locale={locale} size={32} /> : <span className={styles.emptyTier} />}>
        {passport === "loading" ? <FanSkeleton width={56} height={24} /> : passport ? <FanText role="item">{passportTierName(locale, passport)}</FanText> : <FanText role="body" className={styles.muted}>{myHomeText(locale, "tierNone")}</FanText>}
      </Cell>
      <Cell label={dukjilText(locale, "stanFlowHearts")} icon={<RewardIcon kind="heart" size={32} />}><Value locale={locale} slot={hearts} /></Cell>
      <Cell label={w.points} icon={<RewardIcon kind="point" size={32} />}><Value locale={locale} slot={read((data) => data.points)} unit="P" /></Cell>
      <Cell label={w.tickets} icon={<RewardIcon kind="ticket" size={32} />}><Value locale={locale} slot={read((data) => data.tickets)} unit={ko ? "장" : undefined} /></Cell>
      <Cell label={myHomeText(locale, "stampsLabel")} icon={<RewardIcon kind="stamp" size={32} />}><StampValue locale={locale} passport={passport} fallback={stamps} /></Cell>
      <Cell label={myHomeText(locale, "streakLabel")} icon={<span className={styles.streakIcon}><FanIcon icon={CalendarCheck} size={20} /></span>}><Value locale={locale} slot={read((data) => data.attendance.streak)} unit={ko ? "일" : undefined} /></Cell>
    </dl>
  </section>;
}
