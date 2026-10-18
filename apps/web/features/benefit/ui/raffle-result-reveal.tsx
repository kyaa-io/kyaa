"use client";

import Image from "next/image";
import type { AppLocale } from "@/i18n/locales";
import { additionalLocales } from "@/i18n/messages";
import { messages } from "@/i18n/catalogs/features__benefit__ui__raffle-result-reveal";
import { ArrowRight, Gift, Heart, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import styles from "./raffle-result-reveal.module.css";

const copy = {
  ko: { ready: "나의 티켓에 담긴 결과는?", open: "내 결과 확인하기", waiting: "두구두구…", skip: "바로 결과 보기", replay: "다시 보기", help: "티켓을 열어 응모 결과를 확인해 보세요.", thanks: "함께해 줘서 고마워요", ticket: "당신을 위한 티켓", result: "내 응모 결과" },
  en: { ready: "What’s inside your ticket?", open: "Reveal my result", waiting: "Drumroll…", skip: "Show result now", replay: "Watch again", help: "Open your ticket to see your raffle result.", thanks: "Thank you for joining us", ticket: "A ticket for you", result: "My raffle result" },
  ...additionalLocales((locale) => ({
    ready: messages.ready[locale],
    open: messages.open[locale],
    waiting: messages.waiting[locale],
    skip: messages.skip[locale],
    replay: messages.replay[locale],
    help: messages.help[locale],
    thanks: messages.thanks[locale],
    ticket: messages.ticket[locale],
    result: messages.result[locale],
  })),
};
const seenEvent = "byus:raffle-result-seen";
function subscribeSeen(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(seenEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(seenEvent, callback);
  };
}

type Phase = "ready" | "anticipating" | "revealing" | "revealed";

export function RaffleResultReveal({ children, storageKey, outcome, title, imageUrl, headingId, announcement, locale }: {
  children: ReactNode; storageKey: string | null; outcome: "won" | "not_won";
  title: string; imageUrl?: string | null; headingId: string; announcement: string; locale: AppLocale;
}) {
  const t = copy[locale];
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const seen = useSyncExternalStore(subscribeSeen, () => {
    try { return !!storageKey && localStorage.getItem(storageKey) === "1"; } catch { return false; }
  }, () => false);
  const show = !storageKey || phase === "revealed" || (seen && phase === "ready");
  const playing = !show && (phase === "anticipating" || phase === "revealing");

  useEffect(() => {
    if (!show) return;
    const markSeen = () => {
      if (document.hidden || !storageKey) return;
      try {
        if (localStorage.getItem(storageKey) !== "1") {
          localStorage.setItem(storageKey, "1");
          window.dispatchEvent(new Event(seenEvent));
        }
      } catch { /* Storage is optional; the result must stay available. */ }
    };
    markSeen();
    document.addEventListener("visibilitychange", markSeen);
    if (keyboard && !document.hidden) root.current?.querySelector<HTMLElement>("[data-result-heading]")?.focus({ preventScroll: true });
    return () => document.removeEventListener("visibilitychange", markSeen);
  }, [show, storageKey, keyboard]);

  useEffect(() => {
    if (!playing) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const player = video.current;
    let active = true;
    const settle = () => { if (active) setPhase("revealed"); };
    const visibility = () => { if (document.hidden) setPhase("ready"); };
    if (keyboard) root.current?.querySelector<HTMLButtonElement>("[data-skip] button")?.focus({ preventScroll: true });
    // Both approved clips are five seconds; this also bounds a stalled player.
    const timer = window.setTimeout(() => setPhase(phase === "anticipating" ? "revealing" : "revealed"), 5000);
    media.addEventListener("change", settle);
    document.addEventListener("visibilitychange", visibility);
    if (media.matches || document.hidden) setPhase(media.matches ? "revealed" : "ready");
    else {
      try { void player?.play()?.catch(settle); } catch { settle(); }
    }
    return () => {
      active = false;
      window.clearTimeout(timer);
      media.removeEventListener("change", settle);
      document.removeEventListener("visibilitychange", visibility);
      player?.pause();
    };
  }, [playing, phase, keyboard]);

  const open = (detail: number) => {
    if (playing) return;
    setKeyboard(detail === 0);
    setPhase(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "revealed" : "anticipating");
  };
  const settle = () => setPhase("revealed");
  return <div ref={root} className={styles.stage} data-phase={show ? "revealed" : phase} data-outcome={outcome}>
    <div className={styles.media} aria-hidden="true">
      <img className={styles.machine} src={`/images/lotto/${show ? "draw" : "mix"}.png`} alt="" width={1080} height={1080} />
      {playing ? <video key={phase} ref={video} className={styles.machineVideo} src={`/images/lotto/${phase === "anticipating" ? "mix" : "draw"}.mp4`} poster={`/images/lotto/${phase === "anticipating" ? "mix" : "draw"}.png`} muted playsInline loop={phase === "anticipating"} preload="auto" onError={settle} onEnded={phase === "revealing" ? settle : undefined} /> : null}
      {show ? <div className={styles.ball}>
        <img src="/images/lotto/result-ball.png" alt="" width={1080} height={1080} />
        <div className={styles.ballContent} data-result-art>
          {outcome === "won" ? imageUrl && failedImage !== imageUrl
            ? <div className={styles.prize}><Image src={imageUrl} alt="" fill sizes="(min-width: 768px) 180px, 30vw" unoptimized={bypassImageOptimization(imageUrl)} onError={() => setFailedImage(imageUrl)} /></div>
            : <Gift className={styles.symbol} /> : <Heart className={styles.symbol} />}
          <strong>{outcome === "won" ? title || announcement : t.thanks}</strong>
        </div>
      </div> : null}
    </div>
    <div className={styles.content}>
      {show ? <>{children}<FanAction className={styles.replay} variant="text" leadingIcon={<RotateCcw />} onClick={(event) => open(event.detail)}>{t.replay}</FanAction></>
        : <div className={styles.invitation}>
          <span className={styles.eyebrow}>{t.result}</span>
          <h2 id={headingId}>{t.ready}</h2><p>{t.help}</p>
          <FanAction variant="primary" fullWidth onClick={(event) => open(event.detail)} disabled={playing} ariaBusy={playing} trailingIcon={<ArrowRight />}>{playing ? t.waiting : t.open}</FanAction>
          <div data-skip><FanAction variant="text" fullWidth onClick={(event) => { setKeyboard(event.detail === 0); settle(); }}>{t.skip}</FanAction></div>
          {title ? <h3>{title}</h3> : null}
        </div>}
      <span className={styles.srOnly} role="status">{playing ? t.waiting : show && phase !== "ready" && !keyboard ? announcement : ""}</span>
    </div>
  </div>;
}
