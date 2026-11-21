"use client";

import { useEffect, useRef } from "react";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import styles from "./home.module.css";

type RecordRow = {
  id: string;
  place: number;
  name: string;
  avatar?: string;
  change: number;
  record: string;
  isMe?: boolean;
};
export type GameRanking = {
  game: "pair" | "run";
  title: string;
  href?: string;
  status?: "loading" | "ready" | "error";
  leaders: readonly RecordRow[];
  mine: RecordRow | null;
};

const SLOTS = [1, 2, 3] as const;

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
    <div className={styles.rankRow} ref={ref} data-me={row.isMe || undefined}>
      <FanText role="body" data-flash-target="gain">{row.place}</FanText>
      {row.avatar ? <img src={row.avatar} alt="" /> : <span className={styles.rankAvatar} aria-hidden="true">{Array.from(row.name)[0]}</span>}
      <div>
        <FanText role="item">{row.name}</FanText>
        {row.change !== 0 && (
          <FanText role="meta">
            {row.change > 0 ? "▲" : "▼"}
            {Math.abs(row.change)}
          </FanText>
        )}
      </div>
      <FanText role="body" data-flash-target="value">{row.record}</FanText>
    </div>
  );
}

export function GameRankings({ games, label, weekLabel, mineLabel, empty, error, retry, retryLabel }: {
  label: string;
  games: readonly GameRanking[];
  weekLabel?: string;
  mineLabel?: string;
  empty?: string;
  error?: string;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <aside className={styles.rankings} tabIndex={0} aria-label={label}>
      {games.map((game) => {
        const inTop = game.leaders.some((row) => row.isMe);
        return (
          <FanSurface className={styles.rankCard} key={game.game} aria-busy={game.status === "loading"}>
            <header>
              <img src={`/chemi/thumb-${game.game}-128-v2.webp`} alt="" />
              <FanHeading as="h3">{game.title}</FanHeading>
              {game.href && <FanSectionLink href={game.href} ariaLabel={`${game.title} ${weekLabel}`}>{weekLabel}</FanSectionLink>}
            </header>
            <div className={styles.leaders}>
              {game.status === "loading" ? <FanSkeleton height={48} /> : game.status === "error" ? (
                <>
                  <FanText role="meta">{error}</FanText>
                  <FanAction size="sm" onClick={retry}>{retryLabel}</FanAction>
                </>
              ) : SLOTS.map((place, index) => {
                const row = game.leaders[index];
                return row ? <RankingRow key={row.id} row={row} /> : (
                  <div className={styles.rankRow} key={place} data-open="" aria-hidden="true">
                    <FanText role="body">{place}</FanText>
                    <span className={styles.rankAvatar} />
                  </div>
                );
              })}
            </div>
            {inTop ? <div className={styles.rankMine} data-open="" aria-hidden="true" /> : game.mine ? (
              <div className={styles.rankMine}>
                <FanText role="body" data-flash-target="gain">{game.mine.place}</FanText>
                <span className={styles.rankAvatar} aria-hidden="true" />
                <FanText role="body">{mineLabel}</FanText>
                <FanText role="item" data-flash-target="value">{game.mine.record}</FanText>
              </div>
            ) : (
              <div className={styles.rankMine} data-first="">
                {game.status !== "ready" ? null : game.href ? <FanSectionLink href={game.href}>{empty}</FanSectionLink> : <FanText role="meta">{empty}</FanText>}
              </div>
            )}
          </FanSurface>
        );
      })}
    </aside>
  );
}
