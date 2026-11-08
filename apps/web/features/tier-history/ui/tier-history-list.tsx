"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { fanTierName } from "@/features/rewards/domain/fan-stage";
import type { AppLocale } from "@/i18n/locales";
import { tierHistorySchema, type TierHistoryItem } from "../domain/tier-history";
import { tierHistoryCopy } from "./tier-history-copy";
import styles from "./tier-history.module.css";

const parse = (value: unknown) => tierHistorySchema.parse(value);

/** 261107-2 D11: a passport's tier changes, newest first, on the passport detail (`#tier-history`). */
export function TierHistoryList({ passportId, locale }: { passportId: string; locale: AppLocale }) {
  const c = tierHistoryCopy(locale);
  const history = useGroupResource(`/api/me/passports/${encodeURIComponent(passportId)}/tier-history`, parse);
  if (history.loading) return <FanSkeletonRows rows={2} variant="member" />;
  if (!history.data) return <FanState inline compact kind="error" title={c.error} actions={<FanAction onClick={history.retry}>{c.retry}</FanAction>} />;
  if (!history.data.items.length) return <FanState inline compact kind="empty" title={c.empty} />;
  return <ol className={styles.list}>{history.data.items.map(item => <TierHistoryRow key={item.id} item={item} locale={locale} />)}</ol>;
}

function TierHistoryRow({ item, locale }: { item: TierHistoryItem; locale: AppLocale }) {
  const c = tierHistoryCopy(locale), tier = fanTierName(locale, item.tier);
  const what = item.kind === "start" ? c.start : item.kind === "baseline" ? c.baseline : item.kind === "up" ? c.up : c.down;
  const detail = item.previousTier && item.kind !== "baseline" ? `${fanTierName(locale, item.previousTier)} → ${tier}` : tier;
  return <li className={styles.row} data-tier-kind={item.kind}>
    <FanTierBadge tier={item.tier} locale={locale} size={32} adjacentLabel />
    <span className={styles.what}><strong>{what}</strong><span>{detail}</span></span>
    <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" })}</time>
  </li>;
}
