"use client";

import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import type { AppLocale } from "@/i18n/locales";
import { fill, getRunCopy } from "@/app/chemi/games/run/copy";
import styles from "./extra-play-dialog.module.css";

export type ExtraPlayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
  locale: AppLocale;
  points?: number;
  cost: number;
  extraRemaining: number;
};

export function ExtraPlayDialog({ open, onOpenChange, onConfirm, busy, locale, points, cost, extraRemaining: extra }: ExtraPlayDialogProps) {
  const copy = getRunCopy(locale, cost);
  const number = new Intl.NumberFormat(locale);
  return <FanDialog open={open} onOpenChange={onOpenChange} title={copy.extraTitle} closeLabel={copy.close} size="sm" responsive
      secondary={{ label: copy.cancel, onClick: () => onOpenChange(false) }}
      primary={{ label: copy.pay, onClick: onConfirm, disabled: busy || !(cost > 0) || points == null || points < cost || extra <= 0, loading: busy }}>
      {points != null && <dl className={styles.pay}>
        <div><FanText as="dt" role="meta">{copy.pointLabel}</FanText><FanText as="dd" role="item">{number.format(points)}P → {number.format(Math.max(0, points - cost))}P</FanText></div>
        <div><FanText as="dt" role="meta">{copy.extraLabel}</FanText><FanText as="dd" role="item">{3 - extra}/3 → {Math.min(3, 4 - extra)}/3</FanText></div>
      </dl>}
      {points != null && points < cost && <p className={styles.short}>
        <FanText role="meta">{fill(copy.short, { n: cost - points })}</FanText>
        <FanSectionLink href={`/my/wallet?view=attendance&locale=${locale}`}>{copy.earn}</FanSectionLink>
      </p>}
    </FanDialog>;
}
