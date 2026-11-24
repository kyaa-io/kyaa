"use client";

import { VacantRank } from "@/features/chemi/games/vacant-rank";
import { useEffect, useRef } from "react";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { RankAvatar } from "@/features/chemi/games/rank-initial";
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
  /** 기록이 없는 순위 자리: 빈 원 · 미등록(DESIGN 케미 홈). */
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

function RankingRow({ row, vacantLabel }: { row: RecordRow; vacantLabel: string }) {
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
      {row.vacant ? <VacantRank place={row.place} label={vacantLabel} avatarClassName={styles.rankAvatar} /> : <>
        <FanText role="body" data-flash-target="gain">{row.place}</FanText>
        <span className={styles.rankAvatar} aria-hidden="true"><RankAvatar nickname={row.initial === null ? null : row.name} url={row.avatar} /></span>
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
      </>}
    </div>
  );
}

export function GameRankings({ games, label, weekLabel, mineLabel, vacantLabel = "미등록", empty, mineEmpty, start, error, retry, retryLabel }: {
  label: string;
  games: readonly GameRanking[];
  weekLabel?: string;
  mineLabel?: string;
  empty?: string;
  vacantLabel?: string;
  /** 남의 기록은 있고 내 기록만 없을 때. */
  mineEmpty?: string;
  start?: string;
  error?: string;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <aside className={styles.rankings} tabIndex={0} aria-label={label}>
      {games.map((game) => {

        const firstPlay = game.status === "ready" && !game.mine;
        return (
          <FanSurface className={styles.rankCard} key={game.game} aria-busy={game.status === "loading"}>
            <header>
              <img src={`/chemi/thumb-${game.game}-128-v2.webp`} alt="" />
              <FanHeading as="h3">{game.title}</FanHeading>
              {game.href && <FanSectionLink href={game.href} ariaLabel={firstPlay ? [game.title, game.leaders.length ? mineEmpty : empty, start].filter(Boolean).join(" · ") : `${game.title} ${weekLabel}`}>{firstPlay ? start : weekLabel}</FanSectionLink>}
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
                    const row = game.leaders[index] ?? {
                      id: `empty-${index}`, place: index + 1, name: vacantLabel, vacant: true, change: 0, record: "",
                    };
                    return <RankingRow vacantLabel={vacantLabel} key={row.id} row={row} />;
                  })}
                </div>
                {firstPlay && <FanText role="meta" className={styles.rankStatus}>{game.leaders.length ? mineEmpty : empty}</FanText>}
                {game.mine && !game.leaders.some((row) => row.isMe) && (
                  <div className={styles.rankMine}>
                    <FanText role="body" data-flash-target="gain">{game.mine.place}</FanText>
                    <span className={styles.rankAvatar} aria-hidden="true"><RankAvatar nickname={game.mine.initial === null ? null : game.mine.name} url={game.mine.avatar} /></span>
                    <FanText role="body">{mineLabel}</FanText>
                    <FanText role="item" data-flash-target="value">{game.mine.record}</FanText>
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
