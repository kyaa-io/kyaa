"use client";
import type { ReactNode } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import type { HomeCreatorRankingRow, HomeFanRankingRow } from "../domain/types";
import { rankingsText } from "./rankings-copy";
import styles from "./rank-row-panel.module.css";

/** What opens under a ranking row: today's gain, the one value that belongs to the kind (creator: true fans, fan: favorite creator) and the
 * recent-days gain, then one action to the place the row already led to. Values come from the row itself; a value the answer does not have leaves its cell.
 * The list mounts this only while the row is open and owns the profile window (a fan row's action only calls `onOpenProfile`). */
type PanelBase = {
  id: string;
  locale: AppLocale;
  /** The answer's weekGainDays. Zero or less (no comparison) leaves the recent-days cell out. */
  days: number;
  guest: boolean;
};
export type RankRowPanelProps = PanelBase & (
  | { kind: "creator"; row: HomeCreatorRankingRow }
  | { kind: "fan"; row: HomeFanRankingRow; onOpenProfile?: () => void; loginHref?: string }
);

const isCount = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const signed = (locale: AppLocale, value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString(locale)}`;

function Stat({ label, value }: { label: string; value: string }) {
  return <div className={styles.stat}><dt className={styles.label}>{label}</dt><dd className={styles.value} title={value}>{value}</dd></div>;
}

export function RankRowPanel(props: RankRowPanelProps) {
  const { id, locale, days, guest } = props;
  const { row } = props;
  const stats: ReactNode[] = [];
  if (isCount(row.dayGain)) stats.push(<Stat key="today" label={rankingsText(locale, "rkPanelToday")} value={signed(locale, row.dayGain)} />);
  if (props.kind === "creator" && isCount(props.row.fans)) stats.push(<Stat key="fans" label={rankingsText(locale, "rkPanelJjinfan")} value={rankingsText(locale, "rkPanelFanCount", [props.row.fans.toLocaleString(locale)])} />);
  if (props.kind === "fan" && props.row.favorite) stats.push(<Stat key="favorite" label={rankingsText(locale, "rkPanelFavorite")} value={props.row.favorite.name} />);
  if (isCount(row.weekGain) && days > 0) stats.push(<Stat key="recent" label={rankingsText(locale, "rkPanelRecent", [days])} value={signed(locale, row.weekGain)} />);

  let action: ReactNode = null;
  if (props.kind === "creator") {
    action = <FanAction variant="secondary" fullWidth href={`/${props.row.slug}?locale=${locale}`}>{rankingsText(locale, "rkGoFanpage")}</FanAction>;
  } else if (guest) {
    if (props.loginHref) action = <FanAction variant="secondary" fullWidth href={props.loginHref}>{rankingsText(locale, "rkLoginProfile")}</FanAction>;
  } else {
    action = <FanAction variant="secondary" fullWidth disabled={!props.row.profileRef} onClick={props.onOpenProfile}>{rankingsText(locale, "rkViewProfile")}</FanAction>;
  }

  return <div id={id} className={styles.panel} data-rank-panel={props.kind}>
    <div className={styles.clip}>
      <div className={styles.body}>
        {stats.length ? <dl className={styles.stats}>{stats}</dl> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  </div>;
}
