"use client";

import { useEffect, useState } from "react";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Play } from "@/components/fan-ui/fan-icons";
import type { AppLocale } from "@/i18n/locales";
import { fillCount, getExtraPlayCopy } from "./extra-play-copy";
import numberStyles from "@/components/fan-ui/fan-number.module.css";
import styles from "./extra-play-dialog.module.css";

export type ExtraPlayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
  locale: AppLocale;
  points?: number;
  cost: number;
  extraRemaining?: number;
  /** 고른 최애의 얼굴(정사각). 있으면 표 위에 둔다. */
  art?: string;
  /** 게임 말고 다른 곳(질문하기)에서 쓸 때 바꾸는 글자. 없으면 게임 추가 판 글자. */
  labels?: { title: string; extra: string; pay: string };
};

const DAILY_EXTRA = 3;

/** 추가 판 확인(짝 맞추기·최애 런·질문하기 공통). 남은 추가 판 칸 3개 중 이번에 쓸 칸을 한 번 비우고, 포인트는 쓴 뒤 값으로 한 번 굴린다. */
export function ExtraPlayDialog({ open, onOpenChange, onConfirm, busy, locale, points, cost, extraRemaining: extra, art, labels }: ExtraPlayDialogProps) {
  const limited = extra !== undefined;
  const remaining = extra ?? 0;
  const base = getExtraPlayCopy(locale, cost);
  const copy = labels ? { ...base, title: labels.title, left: labels.extra, confirm: labels.pay } : base;
  const number = new Intl.NumberFormat(locale);
  const after = points == null ? null : Math.max(0, points - cost);
  const [shown, setShown] = useState(points ?? 0);
  useEffect(() => {
    if (!open || points == null || after == null) return;
    setShown(points);
    const timer = window.setTimeout(() => setShown(after), 450);
    return () => window.clearTimeout(timer);
  }, [open, points, after]);
  const short = points != null && points < cost;
  return <FanDialog open={open} onOpenChange={onOpenChange} title={copy.title} closeLabel={copy.close} size="sm" responsive
      secondary={{ label: copy.cancel, onClick: () => onOpenChange(false) }}
      primary={{ label: copy.confirm, onClick: onConfirm, disabled: busy || !(cost > 0) || points == null || short || (limited && remaining <= 0), loading: busy }}>
      <div className={styles.body}>
        {limited && <div className={styles.tickets} role="img" aria-label={`${copy.left} ${fillCount(copy.count, remaining)} → ${fillCount(copy.count, Math.max(0, remaining - 1))}`}>
          {art && <img className={styles.face} src={art} alt="" />}
          <ol className={styles.cells} aria-hidden="true">
            {Array.from({ length: DAILY_EXTRA }, (_, index) => {
              const state = index < remaining - 1 ? "left" : index === remaining - 1 ? "spend" : "used";
              return <li key={index} data-row="" data-state={state}><FanIcon icon={Play} size={16} /></li>;
            })}
          </ol>
        </div>}
        {points != null && <dl className={styles.pay}>
          <div>
            <FanText as="dt" role="meta">{copy.points}</FanText>
            {/* 모자라면 빠질 것처럼 보이는 전후 값 대신 지금 값만 둔다(DF-GAME-007). */}
            <dd>{short
              ? <span className={[numberStyles.lg, styles.value].join(" ")}>{number.format(points)}M</span>
              : <>
                <FanText role="meta" className={styles.before}>{number.format(points)}M</FanText>
                <span className={[numberStyles.lg, styles.value].join(" ")}><RollingNumber value={shown} format={(value) => `${number.format(value)}M`} duration={600} /></span>
              </>}
            </dd>
          </div>
          {limited && <div>
            <FanText as="dt" role="meta">{copy.left}</FanText>
            <dd>
              <FanText role="meta" className={styles.before}>{fillCount(copy.count, remaining)}</FanText>
              <span className={[numberStyles.lg, styles.value].join(" ")}>{fillCount(copy.count, Math.max(0, remaining - 1))}</span>
            </dd>
          </div>}
        </dl>}
        {short && <p className={styles.short}>
          <FanText role="meta">{fillCount(copy.short, cost - (points ?? 0))}</FanText>
          <FanSectionLink href={`/benefits?locale=${locale}`}>{copy.earn}</FanSectionLink>
        </p>}
      </div>
    </FanDialog>;
}
