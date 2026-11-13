"use client";
import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/locales";
import type { HomeCreatorRankingRow, HomeFanRankingRow } from "../domain/types";
import { RankUnit, type RankUnitKind } from "./rank-unit";
import { rankingsText } from "./rankings-copy";
import styles from "./rank-row-panel.module.css";

/** What opens under a ranking row: cells only, no button (the row's picture and name are the link to the profile or the fan page). First the totals the list passes in (`extra`: grade, entry tickets,
 * check-in days, posts, hearts), then today's gain, the recent-days gain, the way to first place and the value that belongs to the kind (creator: true fans, fan: favorite creator). Values come from the row itself;
 * at most three of the built-in cells are drawn; a value the answer does not have leaves its cell. The cells start on the picture's left edge. The list mounts this only while the row is open. */
type PanelBase = {
  id: string;
  locale: AppLocale;
  /** The answer's weekGainDays. Zero or less (no comparison) leaves the recent-days cell out. */
  days: number;
  /** Hearts (or points) to the first place; 0 when tied, null on the first row (no cell). */
  gap?: number | null;
  /** Totals the list puts first (label and an already formatted value). A cell is passed only when its value exists; none passed, none drawn. */
  extra?: readonly { key: string; label: string; value: string; unit?: RankUnitKind; icon?: ReactNode }[];
  /** What the list counts: the gain and gap cells carry that unit's asset in front of the number. */
  unit?: RankUnitKind;
};
export type RankRowPanelProps = PanelBase & (
  | { kind: "creator"; row: HomeCreatorRankingRow }
  | { kind: "fan"; row: HomeFanRankingRow }
);

/** A gain worth a cell: a real, non-zero count. Zero and a missing day leave the cell out (no "+0"). */
const isCount = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value !== 0;
const signed = (locale: AppLocale, value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString(locale)}`;

function Stat({ label, value, unit, icon }: { label: string; value: string; unit?: RankUnitKind; icon?: ReactNode }) {
  return <div className={styles.stat}><dt className={styles.label}>{label}</dt><dd className={styles.value} title={value}>{icon ?? (unit ? <RankUnit unit={unit} /> : null)}<span>{value}</span></dd></div>;
}

export function RankRowPanel(props: RankRowPanelProps) {
  const { id, locale, days } = props;
  const { row } = props;
  // Totals first, then at most three built-in cells in this order: today's gain, the recent days' gain, the way to first place (the rank is already on the row), the value that belongs to the kind. A cell without a value is left out.
  const cells: ReactNode[] = [];
  if (isCount(row.dayGain)) cells.push(<Stat key="today" label={rankingsText(locale, "rkPanelToday")} value={signed(locale, row.dayGain)} unit={props.unit} />);
  if (isCount(row.weekGain) && days > 0) cells.push(<Stat key="recent" label={rankingsText(locale, "rkPanelRecent", [days])} value={signed(locale, row.weekGain)} unit={props.unit} />);
  if (typeof props.gap === "number") cells.push(<Stat key="gap" label={rankingsText(locale, "rkPanelGap")} value={props.gap.toLocaleString(locale)} unit={props.unit} />);
  if (props.kind === "creator" && isCount(props.row.fans)) cells.push(<Stat key="fans" label={rankingsText(locale, "rkPanelJjinfan")} value={rankingsText(locale, "rkPanelFanCount", [props.row.fans.toLocaleString(locale)])} />);
  if (props.kind === "fan" && props.row.favorite) cells.push(<Stat key="favorite" label={rankingsText(locale, "rkPanelFavorite")} value={props.row.favorite.name} />);

  const stats = [...(props.extra ?? []).map((cell) => <Stat key={cell.key} label={cell.label} value={cell.value} unit={cell.unit} icon={cell.icon} />), ...cells.slice(0, 3)];
  if (!stats.length) return null;
  return <div id={id} className={styles.panel} data-rank-panel={props.kind}>
    <div className={styles.clip}>
      <div className={styles.body}>
        {stats.length ? <dl className={styles.stats}>{stats}</dl> : null}
      </div>
    </div>
  </div>;
}
