"use client";

import { FanAction } from "@/components/fan-ui/fan-action";
import { useEffect, useState } from "react";
import { entries } from "./contents";
import type { HomeCopy } from "./home";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import styles from "./home.module.css";

export function HomeBanner({
  locale,
  copy,
}: {
  locale: string;
  copy: HomeCopy;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const images = ["fortune/fortune-dosa-wide-v2.webp", "saju/saju-changha-wide-v1.webp", "star/hero-elina-l-v1.webp", "tarot/scene-yuna-l.webp", "banner-match.webp", "banner-run.webp"];
  const [id, , path] = entries[index];
  useEffect(() => {
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % entries.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused]);
  return (
    <section className={styles.banner} onFocus={() => setPaused(true)} onMouseEnter={() => setPaused(true)}>
      <div className={styles.artwork}>
      <img src={`/chemi/${images[index]}`} alt="" />
      <div className={styles.caption}>
        <div>
          <FanHeading as="h1">{copy[id]}</FanHeading>
        </div>
        {path ? <FanAction variant="primary" href={`${path}?locale=${locale}`}>
          {copy.start}
        </FanAction> : <small>{copy.ready}</small>}
      </div>
      </div>
      <div className={styles.dots}>
        {entries.map(([key], n) => <FanAction size="sm" key={key} type="button" ariaLabel={copy[key]} aria-pressed={n === index} onClick={() => { setPaused(true); setIndex(n); }}>{n + 1}</FanAction>)}
      </div>
    </section>
  );
}
