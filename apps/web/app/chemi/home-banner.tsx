"use client";

import { SceneVideo } from "@/features/chemi/ui/scene-video";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { entries } from "./contents";
import type { HomeCopy } from "./home";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Pause, Play } from "@/components/fan-ui/fan-icons";
import styles from "./home.module.css";

const images = {
  fortune: "fortune/fortune-changha-banner-v2.webp",
  saju: "saju/saju-changha-wide-v1.webp",
  zodiac: "star/hero-elina-l-v1.webp",
  tarot: "tarot/scene-yuna-l.webp",
  pair: "banner-match.webp",
  run: "banner-run.webp",
} satisfies Record<(typeof entries)[number][0], string>;

/** 배너 반복 영상 판. v2 = 1080p 원본에서 다시 만든 움직임 큰 영상(11/23 사용자 '화질'·'동적인 느낌'). */
const videoVersion = { fortune: "v2", saju: "v2", zodiac: "v2", tarot: "v1", pair: "v1", run: "v1" } satisfies Record<(typeof entries)[number][0], string>;

export function HomeBanner({
  activities,
  index,
  setIndex,
  copy,
}: {
  activities: readonly { id: keyof typeof images; type: "games" | "readings"; href: string | null }[];
  index: number;
  setIndex: Dispatch<SetStateAction<number>>;
  copy: HomeCopy;
}) {
  const [paused, setPaused] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const resting = paused || pointerInside || keyboardFocus;
  const { id, href, type } = activities[index];
  useEffect(() => {
    if (resting || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % activities.length), 6000);
    return () => window.clearInterval(timer);
  }, [activities.length, index, resting, setIndex]);
  return (
    <section className={styles.banner} onFocus={event => setKeyboardFocus(event.target.matches(":focus-visible"))} onBlur={() => setKeyboardFocus(false)}
      onPointerEnter={() => setPointerInside(true)} onPointerLeave={() => setPointerInside(false)}
      onPointerUp={event => { if (event.pointerType !== "mouse") setPointerInside(false); }} onPointerCancel={() => setPointerInside(false)}>
      <div className={styles.artwork} data-content={id}>
        <img src={`/chemi/${images[id]}`} alt="" />
        <SceneVideo src={`/public-assets/cms-assets/chemi/video/chemi-banner-${id}-loop-${videoVersion[id]}`} paused={resting} objectPosition={id === "tarot" || id === "zodiac" ? "center top" : "center"} />
        <div className={styles.caption}>
          <div><span>{copy[type]}</span><div className={styles.faces}>{["changha", "elina", "yuna"].map(person => <img key={person} alt="" src={`/chemi/grow/face-${person}-v1.webp`} />)}</div><FanHeading as="h1">{copy[id]}</FanHeading></div>
          {href ? (
            <FanAction variant="primary" href={href}>{copy.start}</FanAction>
          ) : (
            <small>{copy.ready}</small>
          )}
        </div>
      </div>
      <div className={styles.dots}>
        {activities.map(({ id: key }, n) => <FanAction size="sm" key={key} type="button" ariaLabel={copy[key]} aria-pressed={n === index} onClick={() => { setIndex(n); }}><span aria-hidden="true" /></FanAction>)}
        <FanIconButton className={styles.pause} aria-label={paused ? copy.resume : copy.pause} onClick={() => setPaused(value => !value)}>
          <FanIcon icon={paused ? Play : Pause} />
        </FanIconButton>
      </div>
    </section>
  );
}
