"use client";

import { runTitle } from "../titles";
import { runDateLabel } from "@/features/chemi/i18n/calendar-label";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanPixelText } from "@/components/fan-ui/fan-pixel-text";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanText } from "@/components/fan-ui/fan-text";
import { fill, type RunCopy } from "./copy";
import { ART } from "./render";
import { Ranking, Scene, type Character, type Rank, type Result } from "./shared";
import { RUN_KEYCAPS, RUN_KEYS, runKeyTarget } from "./keys";
import { Keys, useKeyboardGuide, type RunStats } from "./track";
import styles from "./run.module.css";

function ResultScore({ score, locale, pattern }: { score: number; locale: string; pattern: string }) {
  const [shown, setShown] = useState(score);
  useLayoutEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function finish() {
      cancelAnimationFrame(frame);
      setShown(score);
    }
    if (motion.matches) { finish(); return; }
    setShown(0);
    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / 600);
      setShown(Math.round(score * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    motion.addEventListener("change", finish);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener("change", finish); };
  }, [score]);
  const format = (value: number) => fill(pattern, { n: value.toLocaleString(locale) });
  return <FanPixelText as="strong" role="result" data-run-result="" aria-label={format(score)}>
    <span aria-hidden="true">{format(shown)}</span>
  </FanPixelText>;
}

/** Result screen: score first, then what changed (rank, title, affinity), then what to do next. */
export function ResultStage({ character, copy, locale, names, rows, loaded, stats, result, before, saving, trial, member, spent, free, busy, copied, onAgain, onLogin, onShare, onAllRanks, errorLine, reminder }: {
  character: Character; copy: RunCopy; locale: string; names: Record<Character, string>; rows: Rank[]; loaded: boolean;
  stats?: RunStats; result?: Result; before: { place?: number; best: number }; saving: boolean; trial: boolean; member: boolean;
  spent: boolean; free: number; busy: boolean; copied: boolean;
  onAgain: () => void; onLogin: () => void; onShare: () => void; onAllRanks: () => void; errorLine: ReactNode; reminder: ReactNode;
}) {
  const number = new Intl.NumberFormat(locale);
  const today = runDateLabel(locale, new Date());
  const me = rows.find((row) => row.isMe);
  const climbed = before.place && me && before.place > me.place ? before.place - me.place : 0;
  const score = result?.score ?? stats?.score ?? 0;
  const won = Boolean(stats && !stats.left && score >= before.best && score > 0);
  const keyboard = useKeyboardGuide();
  const next = useRef<HTMLDivElement>(null);
  const canAgain = Boolean(result) && !(member && spent);
  const again = useRef(() => {});
  useEffect(() => { again.current = member ? onAgain : onLogin; });
  // Enter plays again (or signs in) from anywhere on the page; a focused button or link keeps its own Enter.
  useEffect(() => {
    if (!canAgain || busy) return;
    next.current?.querySelector("button")?.focus({ preventScroll: true });
    const enter = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((RUN_KEYS.confirm as readonly string[]).includes(event.code) && runKeyTarget(event.target) === "page") {
        event.preventDefault();
        again.current();
      }
    };
    addEventListener("keydown", enter);
    return () => removeEventListener("keydown", enter);
  }, [canAgain, busy]);
  return <div className={styles.result}>
    <div className={styles.resultMain}>
      <div className={styles.scoreCard}><div className={styles.hero}><Scene resultScene character={character} pose={won ? "win" : "ready"} floor={12} label={names[character]} /></div>
      <div className={styles.sum}>
        <FanText role="meta">{stats?.left ? copy.left : `${names[character]} · ${copy.map} · ${today}`}</FanText>
        <ResultScore score={score} locale={locale} pattern={copy.points} />
        {stats && <FanText role="label">{fill(copy.stats, { m: number.format(stats.meters), n: stats.notes, c: stats.bestCombo, f: stats.fevers })}</FanText>}
        {saving ? <FanText role="meta" aria-live="polite">{copy.saving}</FanText>
          : result && !trial && result.score > before.best ? <FanText role="label" className={styles.recordBadge}>{before.best ? fill(copy.best, { n: number.format(before.best) }) : copy.newBest}</FanText>
            : result && before.best > 0 ? <FanText role="meta">{copy.newBest} {fill(copy.points, { n: number.format(before.best) })}</FanText> : null}
      </div>
      </div>
      {errorLine}
      {result && !trial && <dl className={styles.lines}>
        {me && <div>
          <FanText as="dt" role="meta">{copy.weekRank}</FanText>
          <dd><FanText role="item">{climbed ? `${before.place} → ` : ""}{fill(copy.place, { n: me.place })}</FanText>
            {climbed > 0 && <FanText role="label" className={styles.up}>{fill(copy.steps, { n: climbed })} ↑</FanText>}</dd>
        </div>}
        {result.title ? <div>
          <FanText as="dt" role="meta">{copy.newTitle}</FanText>
          <dd><FanText role="label" className={styles.badge}>{runTitle(locale, result.title) ?? fill(copy.titleName, { n: number.format(result.title) })}</FanText></dd>
        </div> : null}
        <div className={styles.care}>
          <dt><img src={`${ART}/face-${character}-v1.png`} alt="" /></dt>
          <dd><FanText role="item">{fill(copy.care, { name: names[character] })}</FanText>
            <FanText role="item" className={styles.gain}>{result.exp > 0 ? `+${number.format(result.exp)}` : copy.received}</FanText>
            <FanSectionLink href={`/chemi?tab=growth&locale=${locale}`}>{fill(copy.room, { name: names[character] })}</FanSectionLink></dd>
        </div>
      </dl>}
      {result && <div className={styles.next}>
        <FanHeading as="h2">{copy.next}</FanHeading>
        <div className={styles.nextRow} ref={next}>
          {member && spent ? <><FanText as="p" role="item">{copy.done}</FanText>{reminder}</>
            : <FanAction variant="primary" disabled={busy} onClick={member ? onAgain : onLogin} trailingIcon={keyboard && <Keys caps={RUN_KEYCAPS.confirm} />}>
              {!member ? copy.login : free > 0 ? fill(copy.again, { n: free }) : copy.extraCta}
            </FanAction>}
          {result.shareId && <FanAction onClick={onShare}>{copied ? copy.copied : copy.challenge}</FanAction>}
          <FanAction variant="text" href={`/chemi?locale=${locale}`}>{copy.home}</FanAction>
        </div>
      </div>}
    </div>
    <Ranking rows={rows} loaded={loaded} copy={copy} locale={locale} names={names} near onAll={onAllRanks} />
  </div>;
}
