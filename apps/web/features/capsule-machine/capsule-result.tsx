"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { capsuleCopy } from "@/features/group-capsule/copy";
import { capsuleMachineCopy } from "./copy";
import { tallyPrizes, type CapsuleResult } from "./domain";
import type { CapsuleOutcome } from "./palette-art";
import styles from "./capsule-machine.module.css";

/** One result capsule: the pre-rendered closed capsule pops open (same materials and light as the 3D scene); a prize image rises out of it. */
function CapsuleArt({ colorIndex, imageUrl, big, delay }: { colorIndex: number; imageUrl: string | null; big?: boolean; delay: number }) {
  return <span className={big ? `${styles.capArt} ${styles.capArtBig}` : styles.capArt} style={{ "--d": `${delay}ms` } as CSSProperties} aria-hidden="true">
    <img className={styles.capClosed} src={`/images/capsule-machine/capsule-${colorIndex}-closed.webp`} alt="" width={256} height={256} />
    <img className={styles.capOpen} src={`/images/capsule-machine/capsule-${colorIndex}-open.webp`} alt="" width={256} height={256} />
    {imageUrl ? <img className={styles.capPrize} src={imageUrl} alt="" width={96} height={96} /> : null}
  </span>;
}

export function CapsuleResultCard({ result, outcomes, colorIndexes, campaignName, locale, claimHref, againDisabled, onAgain, onClose }: {
  result: CapsuleResult; outcomes: readonly CapsuleOutcome[]; colorIndexes: readonly number[]; campaignName: string; locale: AppLocale;
  claimHref: string; againDisabled: boolean; onAgain: () => void; onClose: () => void;
}) {
  const c = capsuleMachineCopy(locale), base = capsuleCopy(locale), ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const items = [...result.results].sort((a, b) => a.index - b.index);
  const won = items.filter((item) => item.prizeId !== null);
  const rare = outcomes.some((outcome) => outcome.level === 2);
  const close = <FanAction variant="text" onClick={onClose}>{c.text("close")}</FanAction>;
  const claim = <FanAction variant="primary" href={claimHref} fullWidth>{c.text("claim")}</FanAction>;
  if (result.count === 1) {
    const item = items[0]!, outcome = outcomes[0] ?? { level: 0, imageUrl: null };
    return <section ref={ref} tabIndex={-1} className={styles.result} aria-labelledby="capsule-result-title" data-capsule-result="1" data-rare={rare || undefined}>
      <div className={`${styles.resultCard} ${outcome.level === 2 ? styles.rareCard : ""}`}>
        <CapsuleArt colorIndex={colorIndexes[0] ?? 0} imageUrl={item.prizeId ? outcome.imageUrl : null} big delay={0} />
        {outcome.level === 2 ? <FanTag tone="fan">{c.text("rare")}</FanTag> : null}
        <h4 id="capsule-result-title">{item.prizeId ? c.fill("won", { name: item.name ?? "" }) : base.blank}</h4>
        <p>{item.prizeId ? campaignName : c.text("noPrize")}</p>
        <div className={styles.resultActions}>
          {item.prizeId ? claim
            : <FanAction variant="secondary" onClick={onAgain} disabled={againDisabled} fullWidth>{c.text("again")}<small className={styles.cost}>{c.fill("tickets", { n: 1 })}</small></FanAction>}
          {close}
        </div>
      </div>
    </section>;
  }
  const tally = tallyPrizes(result);
  return <section ref={ref} tabIndex={-1} className={styles.result} aria-labelledby="capsule-result-title" data-capsule-result="10" data-rare={rare || undefined}>
    <div className={`${styles.resultCard} ${styles.resultWide}`}>
      <h4 id="capsule-result-title">{c.fill("tenWon", { n: won.length })}</h4>
      {tally.length ? <p className={styles.tally}>{tally.map((entry) => <FanTag key={entry.name} tone="fan">{c.fill("tally", { name: entry.name, n: entry.count })}</FanTag>)}</p> : <p>{c.text("noPrize")}</p>}
      <ol className={styles.grid}>{items.map((item, i) => {
        const outcome = outcomes[i] ?? { level: 0, imageUrl: null };
        return <li key={item.index} className={styles.tile} data-row="capsule-result" data-won={item.prizeId !== null} data-rare={outcome.level === 2 || undefined} style={{ "--d": `${i * 140}ms` } as CSSProperties}>
          <CapsuleArt colorIndex={colorIndexes[i] ?? 0} imageUrl={item.prizeId ? outcome.imageUrl : null} delay={i * 140} />
          <span>{item.prizeId ? item.name : base.blank}</span>
        </li>;
      })}</ol>
      <div className={styles.resultActions}>
        {won.length ? claim : null}
        {close}
      </div>
    </div>
  </section>;
}
