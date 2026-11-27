"use client";

import { VacantRank } from "@/features/chemi/games/vacant-rank";
import { useEffect, useRef, useState } from "react";
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
  /** 상위 다섯 다음 순위(서버가 주는 상위 12·20명까지): '더 보기'로 펼친다. */
  more?: readonly RecordRow[];
  /** 끝낸 판이 있는 사람 수. 0이면 그 칸을 그리지 않는다(K-7ddb53). */
  players?: { total: number; week: number } | null;
  mine: RecordRow | null;
};

/** 상위 세 자리는 기록이 없어도 미등록으로 채운다(DESIGN 케미 홈 11/24). 4·5위는 기록이 있을 때만 그린다(감독 11/27: 빈 자리 숨김). */
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

export function GameRankings({ games, label, weekLabel, mineLabel, vacantLabel = "미등록", empty, mineEmpty, start, error, retry, retryLabel, moreLabel, lessLabel, playersLabel }: {
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
  moreLabel?: string;
  lessLabel?: string;
  /** 참여자 수 한 줄: 지금까지 n명 · 이번 주 n명. */
  playersLabel?: (players: { total: number; week: number }) => string;
}) {
  return (
    <aside className={styles.rankings} tabIndex={0} aria-label={label}>
      {games.map((game) => <RankCard key={game.game} game={game} weekLabel={weekLabel} mineLabel={mineLabel} vacantLabel={vacantLabel} empty={empty}
        mineEmpty={mineEmpty} start={start} error={error} retry={retry} retryLabel={retryLabel} moreLabel={moreLabel} lessLabel={lessLabel} playersLabel={playersLabel} />)}
    </aside>
  );
}

function RankCard({ game, weekLabel, mineLabel, vacantLabel, empty, mineEmpty, start, error, retry, retryLabel, moreLabel, lessLabel, playersLabel }: {
  game: GameRanking; weekLabel?: string; mineLabel?: string; vacantLabel: string; empty?: string; mineEmpty?: string; start?: string; error?: string;
  retry?: () => void; retryLabel?: string; moreLabel?: string; lessLabel?: string; playersLabel?: (players: { total: number; week: number }) => string;
}) {
  const [open, setOpen] = useState(false);
  const firstPlay = game.status === "ready" && !game.mine;
  const more = game.more ?? [];
  const shown = open ? [...game.leaders, ...more] : game.leaders;
  const mineIndex = shown.findIndex((row) => row.isMe);
  const mineInDesktopOverflow = !open && mineIndex >= SLOTS;
  const players = game.status === "ready" && game.players && game.players.total > 0 && playersLabel ? playersLabel(game.players) : null;
  return (
    <FanSurface className={styles.rankCard} aria-busy={game.status === "loading"}>
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
          {players && <FanText role="meta" className={styles.rankPlayers}>{players}</FanText>}
          <div className={styles.leaders} data-collapsed={!open || undefined}>
            {Array.from({ length: Math.max(SLOTS, shown.length) }, (_, index) => {
              const row = shown[index] ?? {
                id: `empty-${index}`, place: index + 1, name: vacantLabel, vacant: true, change: 0, record: "",
              };
              return <RankingRow vacantLabel={vacantLabel} key={row.id} row={row} />;
            })}
          </div>
          {(more.length > 0 || game.leaders.length > SLOTS) && moreLabel && lessLabel && (
            <FanAction variant="text" size="sm" className={more.length ? styles.rankMore : `${styles.rankMore} ${styles.desktopOnly}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? lessLabel : moreLabel}
            </FanAction>
          )}
          {firstPlay && <FanText role="meta" className={styles.rankStatus}>{game.leaders.length ? mineEmpty : empty}</FanText>}
          {game.mine && (mineIndex === -1 || mineInDesktopOverflow) && (
            <div className={mineInDesktopOverflow ? `${styles.rankMine} ${styles.desktopOnly}` : styles.rankMine}>
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
}
