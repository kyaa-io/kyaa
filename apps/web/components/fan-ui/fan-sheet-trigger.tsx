"use client";

import { useState, type ReactNode } from "react";
import { FanAction } from "./fan-action";
import { FanSheet } from "./fan-dialog";
import styles from "./fan-sheet-trigger.module.css";

/** 카드 전체를 누르는 자리(버튼)와 그 설명 바닥 시트. 시트 안 이동 버튼은 `actionHref`가 있을 때만 둔다. 카드 위 덮개 모양은 `className`이 정한다. */
export function FanSheetTrigger({ className, trigger, title, closeLabel, actionHref, actionLabel, children }: {
  className?: string; trigger: ReactNode; title: string; closeLabel: string; actionHref?: string | null; actionLabel: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>{trigger}</button>
    <FanSheet open={open} onOpenChange={setOpen} title={title} closeLabel={closeLabel} side="bottom">
      <div className={styles.body}>
        {children}
        {actionHref ? <FanAction variant="primary" href={actionHref} onClick={() => setOpen(false)}>{actionLabel}</FanAction> : null}
      </div>
    </FanSheet>
  </>;
}
