"use client";

import { useEffect, useRef } from "react";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { CircleUserRound } from "@/components/fan-ui/fan-icons";
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
  /** null 이면 닉네임이 없어 이름이 대체 이름이다: 원 안에 첫 글자 대신 사람 모양. */
  initial?: null;
  change: number;
  record: string;
  isMe?: boolean;
  /** 기록이 없는 순위 자리: 빈 원 · 줄표 · 0(DESIGN 케미 홈). */
  vacant?: true;
};
export type GameRanking = {
  game: "pair" | "run";
  title: string;
  href?: string;
  status?: "loading" | "ready" | "error";
  leaders: readonly RecordRow[];
  mine: RecordRow | null;
};

const SLOTS = 3;

export function EmptyRankingRow({ place }: { place: number }) {
  return <RankingRow row={{ id: `empty-${place}`, place, name: "—", vacant: true, change: 0, record: "0" }} />;
}

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
      {row.avatar ? <img src={row.avatar} alt="" /> : <span className={styles.rankAvatar} aria-hidden="true">{row.vacant ? null : row.initial === null ? <FanIcon icon={CircleUserRound} size={16} /> : Array.from(row.name)[0]}</span>}
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

export function GameRankings({ games, label, weekLabel, mineLabel, empty, mineEmpty, start, error, retry, retryLabel }: {
  label: string;
  games: readonly GameRanking[];
  weekLabel?: string;
  mineLabel?: string;
  empty?: string;
  /** 남의 기록은 있고 내 기록만 없을 때. 주어를 밝혀 1위 줄과 부딪히지 않게 한다. */
  mineEmpty?: string;
  start?: string;
  error?: string;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <aside className={styles.rankings} tabIndex={0} aria-label={label}>
      {games.map((game) => {

        return (
          <FanSurface className={styles.rankCard} key={game.game} aria-busy={game.status === "loading"}>
            <header>
              <img src={`/chemi/thumb-${game.game}-128-v2.webp`} alt="" />
              <FanHeading as="h3">{game.title}</FanHeading>
              {game.href && <FanSectionLink href={game.href} ariaLabel={`${game.title} ${weekLabel}`}>{weekLabel}</FanSectionLink>}
            </header>
            {game.status === "loading" ? <div className={styles.leaders} data-status="loading"><FanSkeleton height={48} /></div> : game.status === "error" ? (
              <div className={styles.leaders} data-status="error">
                <FanText role="meta">{error}</FanText>
                <FanAction size="sm" onClick={retry}>{retryLabel}</FanAction>
              </div>
            ) : (
              <>
                <div className={styles.leaders}>
                  {Array.from({ length: SLOTS }, (_, index) => {
                    const row = game.leaders[index];
                    return row ? <RankingRow key={row.id} row={row} /> : <EmptyRankingRow key={index} place={index + 1} />;
                  })}
                </div>
                {game.leaders.some((row) => row.isMe) ? (
                  <div className={styles.rankMine} data-spacer="" aria-hidden="true" />
                ) : game.mine ? (
                  <div className={styles.rankMine}>
                    <FanText role="body" data-flash-target="gain">{game.mine.place}</FanText>
                    <span className={styles.rankAvatar} aria-hidden="true" />
                    <FanText role="body">{mineLabel}</FanText>
                    <FanText role="item" data-flash-target="value">{game.mine.record}</FanText>
                  </div>
                ) : (
                  <div className={styles.rankMine} data-first="">
                    <FanText role="meta">{game.leaders.length && mineEmpty ? mineEmpty : empty}</FanText>
                    {game.href && <FanSectionLink href={game.href} ariaLabel={`${game.title} ${start}`}>{start}</FanSectionLink>}
                  </div>
                )}
              </>
            )}
          </FanSurface>
        );
      })}
    </aside>
  );
}
