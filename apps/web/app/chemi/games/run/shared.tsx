"use client";

import { rankName } from "@/features/chemi/games/rank-name";
import { RankInitial } from "@/features/chemi/games/rank-initial";
import { useEffect, useRef } from "react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanText } from "@/components/fan-ui/fan-text";
import { fill, type RunCopy } from "./copy";
import { ART, drawScene, loadArt, type PropName, type POSE } from "./render";
import styles from "./run.module.css";

export const characters = ["changha", "elina", "yuna"] as const;
export type Character = (typeof characters)[number];
/** Only Changha's street exists so far; the others stay on the roster, unopened. */
export const open: readonly Character[] = ["changha"];
export type Rank = { place: number; nickname: string; character: Character; score: number; isMe: boolean };
export type Lobby = { freeRemaining: number; extraRemaining: number; ranking: Rank[]; sound: boolean; players: number; best: number; points: number; previous?: { place: number; score: number } | null };
export type Result = { score: number; exp: number; shareId?: string; title?: number | null };
export type Challenge = { score: number; nickname: string; available: boolean; ranking?: Rank[] };
export type Stage = "select" | "run" | "result";
export const SELECT_PROPS: readonly (readonly [PropName, number])[] = [["leaves", 0.04], ["cone", 0.7], ["mailbox", 0.82]];

export function Scene({ pose, props = [], floor, label }: { pose: keyof typeof POSE; props?: readonly (readonly [PropName, number])[]; floor: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!;
    const box = node.parentElement!;
    let active = true;
    function paint() {
      void loadArt().then((art) => {
        if (!active) return;
        const scale = innerWidth >= 1024 ? 4 : 2;
        node.width = Math.ceil(box.clientWidth / scale);
        node.height = Math.ceil(box.clientHeight / scale);
        node.style.width = `${node.width * scale}px`;
        node.style.height = `${node.height * scale}px`;
        drawScene(node.getContext("2d")!, art, node, pose, props, floor);
        node.dataset.painted = "true";
      }).catch(() => {});
    }
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => { active = false; observer.disconnect(); };
  }, [pose, props, floor]);
  return <canvas ref={canvas} role="img" aria-label={label} />;
}

export function Ranking({ rows, loaded, copy, locale, names, near, onAll, footer }: {
  rows: Rank[]; loaded: boolean; copy: RunCopy; locale: string; names: Record<Character, string>; near: boolean; onAll?: () => void; footer?: string;
}) {
  const number = new Intl.NumberFormat(locale);
  const me = rows.find((row) => row.isMe);
  const leaders = rows.filter((row) => row.place <= 3);
  const around = me && me.place > 3 ? rows.filter((row) => row.place > 3 && Math.abs(row.place - me.place) <= 1) : [];
  const above = me && rows.find((row) => row.place === me.place - 1);
  // 기록이 없는 순위는 숫자만 흐리게 둔다(막대를 그리면 불러오는 중처럼 보인다).
  const line = (row: Rank | undefined, key: string, slot?: "near", place?: number) => row ? (
    <li data-row="" key={key} data-me={row.isMe} data-slot={slot && !row.isMe ? "near" : undefined} data-top={row.place <= 3}>
      <FanText role="label" className={styles.place}>{row.place}</FanText>
      <FanText role="label" className={styles.avatar} aria-hidden="true"><RankInitial nickname={row.nickname} /><img src={`${ART}/face-${row.character}-v1.png`} alt="" /></FanText>
      <FanText role="item" className={styles.who}>{rankName(row.nickname, locale)}{row.isMe && ` (${copy.me})`}</FanText>
      <FanText role="meta">{names[row.character]}</FanText>
      <FanText role="item">{number.format(row.score)}</FanText>
    </li>
  ) : <li data-row="" key={key} data-empty="true" data-slot={slot} aria-hidden="true">{place ? <FanText role="label" className={styles.place}>{place}</FanText> : null}</li>;
  return <section className={styles.rank} aria-label={copy.ranking} aria-busy={!loaded}>
    <header>
      <FanHeading as="h2">{copy.ranking}</FanHeading>
      {onAll && rows.length > 0 && <FanSectionLink onClick={onAll}>{copy.allRanks}</FanSectionLink>}
    </header>
    <ol>
      {/* 불러오는 동안만 세 줄 자리를 잡고, 불러온 뒤에는 기록이 있는 순위만 그린다(번호만 있는 빈 줄 금지). */}
      {loaded ? leaders.map((row, i) => line(row, `top${i}`)) : [0, 1, 2].map((i) => line(undefined, `top${i}`))}
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
      {loaded && rows.length === 0 && <FanText role="meta">{copy.emptyRanking}</FanText>}
    </footer>
  </section>;
}

