"use client";

import { useEffect, useRef, useState } from "react";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import styles from "./home.module.css";

type RecordRow = {
  id: string;
  place: number;
  name: string;
  avatar?: string;
  change: number;
  record: string;
};
export type GameRanking = {
  game: "pair" | "run";
  title: string;
  href?: string;
  status?: "loading" | "ready" | "error";
  leaders: readonly RecordRow[];
  mine: RecordRow | null;
};

function RankingRow({ row }: { row: RecordRow }) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(row);
  useEffect(() => {
    const changed = new Set<"gain" | "value">();
    if (previous.current.place !== row.place) changed.add("gain");
    if (previous.current.record !== row.record) changed.add("value");
    if (ref.current && changed.size) flashNumbers(ref.current, changed);
    previous.current = row;
  }, [row]);
  return (
    <div className={styles.rankRow} ref={ref}>
      <strong data-flash-target="gain">{row.place}</strong>
      {row.avatar ? <img src={row.avatar} alt="" /> : <span className={styles.rankAvatar} aria-hidden="true">{Array.from(row.name)[0]}</span>}
      <div>
        <b>{row.name}</b>
        {row.change !== 0 && (
          <small>
            {row.change > 0 ? "▲" : "▼"}
            {Math.abs(row.change)}
          </small>
        )}
      </div>
      <strong data-flash-target="value">{row.record}</strong>
    </div>
  );
}

export function GameRankings({ games, label, empty, error, retry, retryLabel, playLabel, mineLabel }: {
  label: string;
  games: readonly GameRanking[];
  empty?: string;
  error?: string;
  retry?: () => void;
  retryLabel?: string;
  playLabel?: string;
  mineLabel?: string;
}) {
  const [active, setActive] = useState<GameRanking["game"]>(games[0]?.game ?? "pair");
  return (
    <aside className={styles.rankingRail} aria-label={label}>
      <FanHeading>{label}</FanHeading>
      <div className={styles.rankingTabs}>
        <FanTabs variant="chip" label={label} current={active}
          items={games.map(({ game, title }) => ({ key: game, label: title, onSelect: () => setActive(game) }))} />
      </div>
      <div className={styles.rankings} tabIndex={0} role="region" aria-label={label}>
        {games.map((game) => (
          <section className={styles.rankCard} key={game.game} data-active={game.game === active} aria-busy={game.status === "loading"}>
            <FanHeading as="h3">{game.title}</FanHeading>
            {game.status === "loading" ? <FanSkeleton height={48} /> : game.status === "error" ? (
              <FanText role="meta">{error}</FanText>
            ) : game.leaders.length ? (
              <div className={styles.leaders}>
                {game.leaders.map((row) => <RankingRow key={row.id} row={row} />)}
              </div>
            ) : <FanText role="meta">{empty}</FanText>}
            <div className={styles.rankMine}>
              {game.mine ? <RankingRow row={game.mine} /> : game.leaders.length > 0 && <FanText role="meta">{mineLabel} · —</FanText>}
            </div>
            {game.status === "error" ? <FanAction onClick={retry}>{retryLabel}</FanAction>
              : game.href && <FanAction href={game.href}>{playLabel}</FanAction>}
          </section>
        ))}
      </div>
    </aside>
  );
}
