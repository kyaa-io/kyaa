"use client";

import { useEffect, useRef } from "react";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import styles from "./home.module.css";

type RecordRow = {
  id: string;
  place: number;
  name: string;
  avatar: string;
  change: number;
  record: string;
};
export type GameRanking = {
  game: "pair" | "run";
  title: string;
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
      <img src={row.avatar} alt="" />
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

export function GameRankings({ games, label }: { label: string; games: readonly GameRanking[] }) {
  return (
    <aside className={styles.rankings} aria-label={label}>
      {games.map((game) => (
        <section className={styles.rankCard} key={game.game}>
          <header>
            <img src={`/chemi/thumb-${game.game}-128.webp`} alt="" />
            <FanHeading>{game.title}</FanHeading>
          </header>
          <div className={styles.leaders}>
            {game.leaders.slice(0, 3).map((row) => (
              <RankingRow key={row.id} row={row} />
            ))}
          </div>
          {game.mine && (
            <RankingRow key={`mine-${game.mine.id}`} row={game.mine} />
          )}
        </section>
      ))}
    </aside>
  );
}
