import { FanAction } from "@/components/fan-ui/fan-action";
import { Avatar } from "@/features/profile/ui/avatar";
import { avatarCharacterIdSchema, type Avatar as AvatarModel } from "@/features/profile/domain/avatar";
import type { AppLocale } from "@/i18n/locales";
import {
  JJINFAN_CHALLENGE_TARGET, PAGE_RANKING_METRICS, RANKING_PERIODS,
  type JjinfanChallenge, type PageRanking, type PageRankingMetric, type RankingPeriod,
} from "../domain/types";
import { rankingsText, type RankingsCopyKey } from "./rankings-copy";
import { groupMembersCopy } from "@/features/groups/ui/group-members-copy";
import styles from "./rankings.module.css";
import { groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";

const PERIOD_KEY: Record<RankingPeriod, RankingsCopyKey> = { week: "rkWeek", month: "rkMonth", all: "rkAll" };
// D1(M-5)·M4-8: 덕질 기준 칩 이름은 덕질 탭과 같은 키 navStan 하나에서 읽는다(groupBenefitsCopy). 순위 문구에는 덕질 키를 두지 않는다.
const METRIC_KEY: Partial<Record<PageRankingMetric, RankingsCopyKey>> = { hearts: "rkHeartsTab" };
const MEDAL = [styles.medal1, styles.medal2, styles.medal3];

export function fanAvatar(characterId: string): AvatarModel {
  const parsed = avatarCharacterIdSchema.safeParse(characterId);
  const id = parsed.success ? parsed.data : "star-pink";
  return { initialCharacterId: id, characterId: id, source: "character", hasImage: false, revision: 0 };
}

function Chips<T extends string>({ label, values, keyOf, current, locale, onChange, textOf }: {
  label: string; values: readonly T[]; keyOf: Partial<Record<T, RankingsCopyKey>>; current: T; locale: AppLocale; onChange: (value: T) => void; textOf?: (value: T) => string | undefined;
}) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      {values.map((value) => (
        <FanAction key={value} variant="neutral" className={styles.chip} aria-pressed={value === current} onClick={() => onChange(value)}>
          {textOf?.(value) ?? (keyOf[value] ? rankingsText(locale, keyOf[value]) : value)}
        </FanAction>
      ))}
    </div>
  );
}

export function PeriodChips({ locale, period, onChange }: { locale: AppLocale; period: RankingPeriod; onChange: (p: RankingPeriod) => void }) {
  return <Chips label={rankingsText(locale, "rkPeriodLabel")} values={RANKING_PERIODS} keyOf={PERIOD_KEY} current={period} locale={locale} onChange={onChange} />;
}

export function MetricChips({ locale, metric, onChange }: { locale: AppLocale; metric: PageRankingMetric; onChange: (m: PageRankingMetric) => void }) {
  return <Chips label={rankingsText(locale, "rkMetricLabel")} values={PAGE_RANKING_METRICS} keyOf={METRIC_KEY} current={metric} locale={locale} onChange={onChange} textOf={(value) => value === "dukjil" ? groupBenefitsCopy(locale).title : undefined} />;
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
      {reached && !hideBadge ? <span className={compact ? `${styles.soon} ${styles.shortBadge}` : styles.soon}>{rankingsText(locale, compact ? "rkGoalShort" : "rkGoalReached")}</span> : null}
    </div>
  );
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
