import type { Route } from "next";
import Link from "next/link";

import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { Avatar } from "@/features/profile/ui/avatar";
import { avatarCharacterIdSchema, type Avatar as AvatarModel } from "@/features/profile/domain/avatar";
import type { AppLocale } from "@/i18n/locales";
import {
  JJINFAN_CHALLENGE_TARGET, PAGE_RANKING_METRICS, RANKING_PERIODS,
  type CreatorRanking, type JjinfanChallenge, type PageRanking, type PageRankingMetric, type RankingPeriod,
} from "../domain/types";
import { rankingsText, type RankingsCopyKey } from "./rankings-copy";
import { groupMembersCopy } from "@/features/groups/ui/group-members-copy";
import styles from "./rankings.module.css";

const PERIOD_KEY: Record<RankingPeriod, RankingsCopyKey> = { week: "rkWeek", month: "rkMonth", all: "rkAll" };
const METRIC_KEY: Record<PageRankingMetric, RankingsCopyKey> = { hearts: "rkHeartsTab", dukjil: "rkDukjilTab" };
const MEDAL = [styles.medal1, styles.medal2, styles.medal3];

export function fanAvatar(characterId: string): AvatarModel {
  const parsed = avatarCharacterIdSchema.safeParse(characterId);
  const id = parsed.success ? parsed.data : "star-pink";
  return { initialCharacterId: id, characterId: id, source: "character", hasImage: false, revision: 0 };
}

function Chips<T extends string>({ label, values, keyOf, current, locale, onChange }: {
  label: string; values: readonly T[]; keyOf: Record<T, RankingsCopyKey>; current: T; locale: AppLocale; onChange: (value: T) => void;
}) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      {values.map((value) => (
        <FanAction key={value} variant="neutral" className={styles.chip} aria-current={value === current ? "true" : undefined} onClick={() => onChange(value)}>
          {rankingsText(locale, keyOf[value])}
        </FanAction>
      ))}
    </div>
  );
}

export function PeriodChips({ locale, period, onChange }: { locale: AppLocale; period: RankingPeriod; onChange: (p: RankingPeriod) => void }) {
  return <Chips label={rankingsText(locale, "rkPeriodLabel")} values={RANKING_PERIODS} keyOf={PERIOD_KEY} current={period} locale={locale} onChange={onChange} />;
}

export function MetricChips({ locale, metric, onChange }: { locale: AppLocale; metric: PageRankingMetric; onChange: (m: PageRankingMetric) => void }) {
  return <Chips label={rankingsText(locale, "rkMetricLabel")} values={PAGE_RANKING_METRICS} keyOf={METRIC_KEY} current={metric} locale={locale} onChange={onChange} />;
}

function Rank({ rank }: { rank: number }) {
  return <span className={`${styles.rank} ${rank <= 3 ? MEDAL[rank - 1] : ""}`}>{rank}</span>;
}

export function AsOf({ locale, computedAt }: { locale: AppLocale; computedAt: string | null }) {
  if (!computedAt) return null;
  const date = new Date(computedAt);
  if (Number.isNaN(date.getTime())) return null;
  const text = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date);
  return <p className={styles.asOf}>{rankingsText(locale, "rkAsOf", [text])}</p>;
}

export function Empty({ locale }: { locale: AppLocale }) {
  return <p className={styles.state} role="status">{rankingsText(locale, "rkEmpty")}</p>;
}

export function JjinfanProgress({ locale, count, target = JJINFAN_CHALLENGE_TARGET, compact = false, hideBadge = false }: {
  locale: AppLocale; count: number; target?: number; compact?: boolean; hideBadge?: boolean;
}) {
  const shown = Math.min(count, target);
  const reached = count >= target;
  return (
    <div className={styles.progress}>
      <span className={styles.sub}>{rankingsText(locale, compact ? "rkJjinfan" : "rkChallenge", [shown, target])}</span>
      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={shown}>
        <div className={styles.barFill} style={{ width: `${Math.round((shown / target) * 100)}%` }} />
      </div>
      {reached && !hideBadge ? <span className={styles.soon}>{rankingsText(locale, "rkGoalReached")}</span> : null}
    </div>
  );
}

type CreatorRow = CreatorRanking["rows"][number];

/** Top three: first in the middle and raised, with the same hearts, progress and goal badge as the rows below. DOM order stays 1, 2, 3 for screen readers; CSS sets the visual order. */
function RankingPodium({ locale, rows, target }: { locale: AppLocale; rows: CreatorRow[]; target: number }) {
  return (
    <ol className={styles.podium}>
      {rows.map((row, index) => (
        <li key={row.slug} className={styles.podiumItem}>
          <Link href={`/${row.slug}?locale=${locale}` as Route} className={styles.podiumLink}>
            <span className={styles.podiumImage}>
              <CreatorAvatar slug={row.slug} src={row.imageUrl} size={index === 0 ? 72 : 56} photos={undefined} />
              <span className={`${styles.podiumRank} ${MEDAL[row.rank - 1] ?? ""}`}>{row.rank}</span>
            </span>
            <span className={styles.podiumName}>{row.name}</span>
            <span className={styles.podiumScore}>{rankingsText(locale, "rkHearts", [row.score.toLocaleString(locale)])}</span>
            <JjinfanProgress locale={locale} count={row.jjinfanCount} target={target} compact />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * `embedded` is the 덕질 tab form: names wrap, the rank sits on the image corner and, from 1024px, the row reads as columns
 * (name + meeting badge / progress with a fixed-width bar / my hearts / hearts). Below 1024px it keeps the stacked form of `/rankings`.
 * Three or more rows: the top three become a podium and the list starts from the fourth. With a `limit`, the highest row below it that the viewer gave hearts to is pinned under the list.
 */
export function CreatorRankingList({ locale, ranking, target = JJINFAN_CHALLENGE_TARGET, limit, embedded = false, lockedMine = false }: { locale: AppLocale; ranking: CreatorRanking; target?: number; limit?: number; embedded?: boolean; lockedMine?: boolean }) {
  if (ranking.rows.length === 0) return embedded ? <FanState inline compact kind="empty" title={rankingsText(locale, "rkEmpty")} /> : <Empty locale={locale} />;
  const rows = limit === undefined ? ranking.rows : ranking.rows.slice(0, limit);
  const podium = rows.length >= 3 ? rows.slice(0, 3) : [];
  const listed = rows.slice(podium.length);
  const pinned = limit === undefined || lockedMine ? undefined : ranking.rows.slice(limit).find((row) => row.myHearts !== null && row.myHearts > 0);
  // The "my hearts" column exists only while some listed row has a value; otherwise the progress column moves next to the hearts count.
  const anyMine = lockedMine || [...listed, ...(pinned ? [pinned] : [])].some((row) => row.myHearts !== null && row.myHearts > 0);
  // Guests: the "my hearts" cell keeps its label and a lock where the number goes. The unit after the number ("개") is dropped; every language puts the label first.
  const mineLabel = lockedMine ? rankingsText(locale, "rkMyHearts", ["\u0000"]).split("\u0000")[0].trimEnd() : "";
  const renderRow = (row: CreatorRow, className = styles.row) => (
    <li key={row.slug} className={className}>
      <Rank rank={row.rank} />
      <Link href={`/${row.slug}?locale=${locale}` as Route} className={styles.who}>
        <CreatorAvatar slug={row.slug} src={row.imageUrl} size={embedded ? 44 : 48} photos={undefined} />
        <span className={styles.names}>
          {embedded ? (
            <span className={styles.nameLine}>
              <span className={styles.name}>{row.name}</span>
              {row.jjinfanCount >= target ? <span className={`${styles.soon} ${styles.nameBadge}`}>{rankingsText(locale, "rkGoalReached")}</span> : null}
            </span>
          ) : <span className={styles.name}>{row.name}</span>}
          <JjinfanProgress locale={locale} count={row.jjinfanCount} target={target} compact hideBadge={embedded} />
          {lockedMine ? <span className={`${styles.sub} ${styles.myHearts}`} data-mine-lock="">{mineLabel}<FanLockedValue locale={locale} /></span> : null}
          {!lockedMine && row.myHearts !== null && row.myHearts > 0 ? <span className={`${styles.sub} ${styles.myHearts}`}>{rankingsText(locale, "rkMyHearts", [row.myHearts.toLocaleString(locale)])}</span> : null}
        </span>
      </Link>
      <span className={styles.score}>{rankingsText(locale, "rkHearts", [row.score.toLocaleString(locale)])}</span>
    </li>
  );
  const list = listed.length > 0 || pinned ? (
    <ol className={embedded ? `${styles.list} ${styles.embedded}${anyMine ? "" : ` ${styles.noMine}`}` : styles.list}>
      {listed.map((row) => renderRow(row))}
      {pinned ? renderRow(pinned, `${styles.row} ${styles.pinnedRow}`) : null}
    </ol>
  ) : null;
  if (podium.length === 0) return list;
  return <div className={styles.ranking}><RankingPodium locale={locale} rows={podium} target={target} />{list}</div>;
}

export function FanRankingList({ locale, ranking }: { locale: AppLocale; ranking: PageRanking }) {
  const scoreKey: RankingsCopyKey = ranking.metric === "hearts" ? "rkHearts" : "rkStamps";
  const me = ranking.me;
  return (
    <>
      {ranking.rows.length === 0 ? <Empty locale={locale} /> : (
        <ol className={styles.list}>
          {ranking.rows.map((row) => (
            <li key={row.rank} className={`${styles.row} ${row.isMe ? styles.rowMe : ""}`} aria-current={row.isMe || undefined}>
              <Rank rank={row.rank} />
              <span className={styles.who}>
                <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} />
                <span className={styles.name}>{row.nickname}{row.isMe ? <span className={styles.meBadge}>{rankingsText(locale, "rkMe")}</span> : null}</span>
              </span>
              <span className={styles.score}>{rankingsText(locale, scoreKey, [row.score.toLocaleString(locale)])}</span>
            </li>
          ))}
        </ol>
      )}
      {me && !me.inTop ? (
        <div className={styles.pinned} role="status">
          <span className={styles.sub}>{rankingsText(locale, "rkMyRank")}</span>
          <strong>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])} · {rankingsText(locale, scoreKey, [me.score.toLocaleString(locale)])}</strong>
        </div>
      ) : null}
    </>
  );
}

/** Below the 100 active fans rule: the same words as the member tab, and my own rank, which is always mine to see. */
export function RankingClosed({ locale, ranking }: { locale: AppLocale; ranking: PageRanking }) {
  const scoreKey: RankingsCopyKey = ranking.metric === "hearts" ? "rkHearts" : "rkStamps";
  return (
    <>
      <p className={styles.state} role="status">{groupMembersCopy(locale).threshold}</p>
      {ranking.me ? (
        <div className={styles.pinned} role="status">
          <span className={styles.sub}>{rankingsText(locale, "rkMyRank")}</span>
          <strong>{rankingsText(locale, "rkRank", [ranking.me.rank.toLocaleString(locale)])} · {rankingsText(locale, scoreKey, [ranking.me.score.toLocaleString(locale)])}</strong>
        </div>
      ) : null}
    </>
  );
}

export type { JjinfanChallenge };
