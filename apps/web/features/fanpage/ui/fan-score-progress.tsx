"use client";

import { messages as localizedMessages } from "@/i18n/catalogs/features__fanpage__ui__fan-score-progress";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { useEffect, useId, useRef, useState } from "react";
import type { PassportCreator } from "@/features/my/domain/my-progress";
import { fanStageNextText } from "@/features/rewards/ui/fan-stage-next";
import styles from "./fan-score-progress.module.css";

type Props = {
  passport: PassportCreator["passport"];
  locale: AppLocale;
};

export function FanScoreProgress({ passport, locale }: Props) {
  // The next step is the server's stage progress only (BUGS-1846): "실버까지 도장 1칸", "골드까지 하트 1개". No point thresholds here.
  const stage = passport.stageProgress ?? null;
  const tooltipId = useId();
  const root = useRef<HTMLDivElement>(null);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const score = passport.score.toLocaleString(locale);
  const stageValue = stage ? fanStageNextText(locale, stage) ?? (locale === "ko" ? "모든 단계를 달성했어요" : translate(locale, localizedMessages.mc2f0efce3633, "All stages reached")) : null;
  const currentScoreLabel = `${locale === "ko" ? "현재 점수" : translate(locale, localizedMessages.mf871410e5769, "Current score")}: ${score}${locale === "ko" ? "점" : translate(locale, localizedMessages.m2d8c681d11b6, " points")}`;

  useEffect(() => {
    if (!open) return;
    const dismiss = () => { pinned.current = false; setOpen(false); };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div
    ref={root}
    className={styles.root}
    onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(true); }}
    onPointerLeave={() => { if (!pinned.current) setOpen(false); }}
  >
    <div className={styles.summary} aria-hidden="true"><strong>{score}{locale === "ko" ? "점" : translate(locale, localizedMessages.m2d8c681d11b6, " points")}</strong>{stageValue ? <span>{stageValue}</span> : null}</div>
    <button
      className={styles.trigger}
      type="button"
      aria-label={locale === "ko" ? "팬 점수 자세히 보기" : translate(locale, localizedMessages.m17d872928dd3, "View Fan Score details")}
      aria-expanded={open}
      aria-controls={tooltipId}
      aria-describedby={open ? tooltipId : undefined}
      onFocus={() => setOpen(true)}
      onBlur={() => { pinned.current = false; setOpen(false); }}
      onClick={() => { pinned.current = !pinned.current; setOpen(pinned.current); }}
    >
      <progress
        value={stage ? stage.progressPercent : 0}
        max={100}
        aria-label={locale === "ko" ? "팬 등급 진행도" : translate(locale, localizedMessages.mda729f4ab53d, "Fan tier progress")}
        aria-valuetext={stageValue ? `${stageValue}. ${currentScoreLabel}` : currentScoreLabel}
      />
    </button>
    <span className={styles.tooltip} role="tooltip" id={tooltipId} hidden={!open}>
      {stageValue ? <span className={styles.stageDetail}><strong>{stageValue}</strong></span> : null}
      <span className={styles.currentDetail}><span>{locale === "ko" ? "현재 점수" : translate(locale, localizedMessages.mf871410e5769, "Current score")}</span><strong>{score}{locale === "ko" ? "점" : translate(locale, localizedMessages.m2d8c681d11b6, " points")}</strong></span>
    </span>
  </div>;
}
