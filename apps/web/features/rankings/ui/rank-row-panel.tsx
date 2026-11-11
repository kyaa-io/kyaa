"use client";
import type { ReactNode } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import type { HomeCreatorRankingRow, HomeFanRankingRow } from "../domain/types";
import { RankUnit, type RankUnitKind } from "./rank-unit";
import { rankingsText } from "./rankings-copy";
import styles from "./rank-row-panel.module.css";

/** What opens under a ranking row: up to three cells (today's gain, the recent-days gain, the way to first place; the value that belongs to the kind — creator: true fans, fan: favorite creator — when one of those is missing), then one action to the place the row already led to. Values come from the row itself; a value the answer does not have leaves its cell.
 * The list mounts this only while the row is open and owns the profile window (a fan row's action only calls `onOpenProfile`). */
type PanelBase = {
  id: string;
  locale: AppLocale;
  /** The answer's weekGainDays. Zero or less (no comparison) leaves the recent-days cell out. */
  days: number;
  guest: boolean;
  /** Hearts (or points) to the first place; 0 when tied, null on the first row (no cell). */
  gap?: number | null;
  /** Cells the list adds after the built-in ones (label and an already formatted value). A cell is passed only when its value exists; none passed, none drawn. */
  extra?: readonly { key: string; label: string; value: string; unit?: RankUnitKind; icon?: ReactNode }[];
  /** What the list counts: the gain and gap cells carry that unit's asset in front of the number. */
  unit?: RankUnitKind;
};
export type RankRowPanelProps = PanelBase & (
  | { kind: "creator"; row: HomeCreatorRankingRow }
  | { kind: "fan"; row: HomeFanRankingRow; onOpenProfile?: () => void; loginHref?: string }
);

/** A gain worth a cell: a real, non-zero count. Zero and a missing day leave the cell out (no "+0"). */
const isCount = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value !== 0;
const signed = (locale: AppLocale, value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString(locale)}`;

function Stat({ label, value, unit, icon }: { label: string; value: string; unit?: RankUnitKind; icon?: ReactNode }) {
  return <div className={styles.stat}><dt className={styles.label}>{label}</dt><dd className={styles.value} title={value}>{icon ?? (unit ? <RankUnit unit={unit} /> : null)}<span>{value}</span></dd></div>;
}

export function RankRowPanel(props: RankRowPanelProps) {
  const { id, locale, days, guest } = props;
  const { row } = props;
  // At most three cells, in this order: today's gain, the recent days' gain, the way to first place (the rank is already on the row), then the value that belongs to the kind. A cell without a value is left out.
  const cells: ReactNode[] = [];
  if (isCount(row.dayGain)) cells.push(<Stat key="today" label={rankingsText(locale, "rkPanelToday")} value={signed(locale, row.dayGain)} unit={props.unit} />);
  if (isCount(row.weekGain) && days > 0) cells.push(<Stat key="recent" label={rankingsText(locale, "rkPanelRecent", [days])} value={signed(locale, row.weekGain)} unit={props.unit} />);
  if (typeof props.gap === "number") cells.push(<Stat key="gap" label={rankingsText(locale, "rkPanelGap")} value={props.gap.toLocaleString(locale)} unit={props.unit} />);
  if (props.kind === "creator" && isCount(props.row.fans)) cells.push(<Stat key="fans" label={rankingsText(locale, "rkPanelJjinfan")} value={rankingsText(locale, "rkPanelFanCount", [props.row.fans.toLocaleString(locale)])} />);
  if (props.kind === "fan" && props.row.favorite) cells.push(<Stat key="favorite" label={rankingsText(locale, "rkPanelFavorite")} value={props.row.favorite.name} />);
  const stats = [...cells.slice(0, 3), ...(props.extra ?? []).map((cell) => <Stat key={cell.key} label={cell.label} value={cell.value} unit={cell.unit} icon={cell.icon} />)];

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
