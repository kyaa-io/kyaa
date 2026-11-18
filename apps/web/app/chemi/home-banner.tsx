"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
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
  const [fortune, setFortune] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = window.setInterval(() => setFortune((value) => !value), 6000);
    return () => window.clearInterval(timer);
  }, [paused]);
  return (
    <section className={styles.banner}>
      <picture>
        <source
          media="(min-width: 48rem)"
          srcSet={fortune ? "/chemi/fortune.png" : "/chemi/hero-01-1440.png"}
        />
        <img
          src={fortune ? "/chemi/fortune.png" : "/chemi/hero-01-390.png"}
          alt=""
        />
      </picture>
      <div className={styles.controls}>
        <FanAction variant="neutral"
          type="button"
          ariaLabel={copy.next}
          onClick={() => {
            setPaused(true);
            setFortune((value) => !value);
          }}
        >
          {fortune ? "2/2" : "1/2"}
        </FanAction>
        <FanAction variant="neutral"
          type="button"
          ariaLabel={paused ? copy.resume : copy.pause}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? "▶" : "Ⅱ"}
        </FanAction>
      </div>
      <div className={styles.caption}>
        <div>
          <small>{locale === "ko" ? "창하" : "Changha"}</small>
          <FanHeading as="h1">{fortune ? copy.fortune : copy.tarot}</FanHeading>
        </div>
        {fortune ? (
          <FanAction href={`/chemi/fortune?locale=${locale}`}>
            {copy.start}
          </FanAction>
        ) : (
          <span>{copy.ready}</span>
        )}
      </div>
    </section>
  );
}
