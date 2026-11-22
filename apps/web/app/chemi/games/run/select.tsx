"use client";

import { rankName } from "@/features/chemi/games/rank-name";
import type { ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { fill, type RunCopy } from "./copy";
import { ART } from "./render";
import { characters, open, Ranking, Scene, SELECT_PROPS, type Challenge, type Character, type Rank } from "./shared";
import { Legend } from "./track";
import styles from "./run.module.css";

/** Choose screen: roster, map preview, this week's ranking and the one start button. */
export function SelectStage({ copy, locale, names, rows, loaded, footer, challenge, spent, startLabel, startDisabled, onStart, onAllRanks, errorLine, reminder }: {
  copy: RunCopy; locale: string; names: Record<Character, string>; rows: Rank[]; loaded: boolean; footer: string;
  challenge?: Challenge; spent: boolean; startLabel: string; startDisabled: boolean; onStart: () => void; onAllRanks: () => void;
  errorLine: ReactNode; reminder: ReactNode;
}) {
  const number = new Intl.NumberFormat(locale);
  // One course a day, the same for everyone, changing at midnight in Korea.
  const today = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date());
  return <div className={styles.select}>
    <ul className={styles.picks} aria-label={copy.title}>
      {characters.map((who) => <li data-row="" key={who} data-who={who} data-on={who === "changha"} aria-disabled={!open.includes(who)}>
        <img src={`${ART}/face-${who}-v1.png`} alt="" />
        {who === "changha" && <FanText role="label" className={styles.cursor}>1P</FanText>}
        <FanText role="label" className={styles.pickName}>{names[who]}</FanText>
      </li>)}
    </ul>
    <section className={styles.stageCard}>
      <div className={styles.scene}>
        <Scene pose="ready" props={SELECT_PROPS} floor={20} label={`${names.changha} · ${copy.map}`} />
        <FanText role="label" className={styles.course}>{fill(copy.course, { date: today })}</FanText>
      </div>
      <div className={styles.strip}>
        <FanText role="item">{names.changha}</FanText>
        <FanText role="meta">{copy.map}</FanText>
        {challenge && <FanText role="meta" className={styles.record}>{copy.record} · {rankName(challenge.nickname, locale)} {fill(copy.points, { n: number.format(challenge.score) })}</FanText>}
      </div>
      <div className={styles.how}><Legend copy={copy} layout="list" /></div>
    </section>
    <div className={styles.side}>
      <Ranking rows={rows} loaded={loaded} copy={copy} locale={locale} names={names} near onAll={onAllRanks} footer={footer} />
      <div className={styles.sideLegend}><Legend copy={copy} layout="list" /></div>
      <div className={styles.cta}>
        {errorLine}
        {spent ? <>
          <FanText as="p" role="item">{copy.done}</FanText>
          {reminder}
        </> : <FanAction variant="primary" fullWidth disabled={startDisabled} onClick={onStart}>{startLabel}</FanAction>}
      </div>
    </div>
  </div>;
}
