"use client";

import { VacantRank } from "@/features/chemi/games/vacant-rank";
import { rankName } from "@/features/chemi/games/rank-name";
import { RankAvatar } from "@/features/chemi/games/rank-initial";
import { useEffect, useRef } from "react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanText } from "@/components/fan-ui/fan-text";
import { fill, type RunCopy } from "./copy";
import { getMatchCopy } from "../match/copy";
import { ART, drawScene, pixelScale, loadArt, type PropName, type POSE } from "./render";
import styles from "./run.module.css";

export const characters = ["changha", "elina", "yuna"] as const;
export type Character = (typeof characters)[number];

export type Rank = { place: number; avatarUrl?: string | null; nickname: string; character: Character; score: number; isMe: boolean };
export type Lobby = { extraCost: number; freeRemaining: number; extraRemaining: number; ranking: Rank[]; sound: boolean; players: number; best: number; points: number; previous?: { place: number; score: number } | null };
export type Result = { score: number; exp: number; shareId?: string; title?: number | null };
export type Challenge = { score: number; avatarUrl?: string | null; nickname: string; available: boolean; ranking?: Rank[] };
export type Stage = "select" | "run" | "result";
export const SELECT_PROPS: readonly (readonly [PropName, number])[] = [["leaves", 0.04], ["cone", 0.7], ["mailbox", 0.82]];

export function Scene({ resultScene = false, character, pose, props = [], floor, label }: { resultScene?: boolean; character: Character; pose: keyof typeof POSE; props?: readonly (readonly [PropName, number])[]; floor: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!;
    const box = node.parentElement!;
    let active = true;
    function paint() {
      void loadArt(character).then((art) => {
        if (!active) return;
        const scale = pixelScale(innerWidth >= 1024 && !resultScene ? 4 : 2);
        node.width = Math.ceil(box.clientWidth / scale);
        node.height = Math.ceil(box.clientHeight / scale);
        node.style.width = `${node.width * scale}px`;
        node.style.height = `${node.height * scale}px`;
        drawScene(node.getContext("2d")!, art, node, pose, props, floor, resultScene);
        node.dataset.painted = "true";
      }).catch(() => {});
    }
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => { active = false; observer.disconnect(); };
  }, [character, pose, props, floor, resultScene]);
  return <canvas ref={canvas} role="img" aria-label={label} />;
}

export function Ranking({ rows, loaded, loading = false, copy, locale, names, near, onAll, footer }: {
  rows: Rank[]; loaded: boolean; loading?: boolean; copy: RunCopy; locale: string; names: Record<Character, string>; near: boolean; onAll?: () => void; footer?: string;
}) {
  const number = new Intl.NumberFormat(locale);
  const me = rows.find((row) => row.isMe);
  const leaders = rows.filter((row) => row.place <= 3);
  const around = me && me.place > 3 ? rows.filter((row) => row.place > 3 && Math.abs(row.place - me.place) <= 1) : [];
  const above = me && rows.find((row) => row.place === me.place - 1);
  const line = (row: Rank | undefined, key: string, slot?: "near", place?: number) => row ? (
    <li data-row="" key={key} data-me={row.isMe} data-slot={slot && !row.isMe ? "near" : undefined} data-top={row.place <= 3}>
      <FanText role="label" className={styles.place}>{row.place}</FanText>
      <FanText role="label" className={styles.avatar} aria-hidden="true"><RankAvatar nickname={row.nickname} url={row.avatarUrl} /><img className={styles.characterBadge} src={`${ART}/face-${row.character}-v1.png`} alt="" /></FanText>
      <FanText role="item" className={styles.who}>{rankName(row.nickname, locale)}{row.isMe && ` (${copy.me})`}</FanText>
      <FanText role="meta">{names[row.character]}</FanText>
      <FanText role="item">{number.format(row.score)}</FanText>
    </li>
  ) : <li data-row="" key={key} data-empty="true" data-slot={slot} aria-hidden={place ? undefined : true}>
    {place && <VacantRank place={place} label={getMatchCopy(locale).vacant} avatarClassName={styles.avatar} />}
    {!place && loading && <FanSkeleton className={styles.rowSkeleton} />}
  </li>;
  return <section className={styles.rank} aria-label={copy.ranking} aria-busy={loading}>
    <header>
      <FanHeading as="h2">{copy.ranking}</FanHeading>
      {onAll && rows.length > 0 && <FanSectionLink onClick={onAll}>{copy.allRanks}</FanSectionLink>}
    </header>
    <ol>
      {[1, 2, 3].map((place) => line(loaded ? leaders.find((row) => row.place === place) : undefined, `top${place}`, undefined, loaded ? place : undefined))}
      {near && around.length > 0 && <>
        <li data-row="" data-gap="true" data-slot="near" aria-hidden="true">{me && me.place > 5 && <FanText role="meta">···</FanText>}</li>
        {line(around.find((row) => row.place === me!.place - 1), "near0", "near")}
        {line(around.find((row) => row.isMe), "mine")}
        {line(around.find((row) => row.place === me!.place + 1), "near1", "near")}
      </>}
    </ol>
    <footer>
      {above && near && <FanText role="meta" className={styles.above}><span>{fill(copy.above, { name: rankName(above.nickname, locale) })}</span><b>{fill(copy.points, { n: number.format(above.score - me!.score) })}</b></FanText>}
      {footer && <FanText role="meta">{footer}</FanText>}
      {loaded && rows.length === 0 && <FanText role="meta">{getMatchCopy(locale).emptyRanking}</FanText>}
    </footer>
  </section>;
}

