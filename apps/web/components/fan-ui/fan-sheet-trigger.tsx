"use client";

import { useState, type ReactNode } from "react";
import { FanAction } from "./fan-action";
import { FanDialog } from "./fan-dialog";
import styles from "./fan-sheet-trigger.module.css";

/** 카드 전체를 누르는 자리(버튼)와 그 설명 창. 1024 미만은 바닥 시트, 1024+는 가운데 모달이다(`FanDialog responsive`).
 * 창 안 이동 버튼은 `actionHref`가 있을 때만 둔다. `wrapAction`은 그 버튼을 감싼다(모서리 포인트 뱃지). 카드 위 덮개 모양은 `className`이 정한다. */
export function FanSheetTrigger({ className, trigger, title, closeLabel, actionHref, actionLabel, wrapAction, children }: {
  className?: string; trigger: ReactNode; title: string; closeLabel: string; actionHref?: string | null; actionLabel: string; wrapAction?: (action: ReactNode) => ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const action = actionHref ? <FanAction variant="primary" fullWidth href={actionHref} onClick={() => setOpen(false)}>{actionLabel}</FanAction> : null;
  return <>
    <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>{trigger}</button>
    <FanDialog open={open} onOpenChange={setOpen} title={title} closeLabel={closeLabel} responsive size="sm">
      <div className={styles.body}>
        {children}
        {action ? <div className={styles.action}>{wrapAction ? wrapAction(action) : action}</div> : null}
      </div>
    </FanDialog>
  </>;
}
