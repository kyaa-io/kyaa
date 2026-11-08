"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useState, type MouseEventHandler, type ReactNode } from "react";
import styles from "./fan-collapsible.module.css";

export type FanCollapsibleTriggerProps = Readonly<{
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: MouseEventHandler<HTMLElement>;
}>;

export type FanCollapsibleProps = Readonly<{
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 여는 버튼. `triggerProps`를 버튼(`FanAction`이나 `FanCollapsibleTrigger`)에 그대로 펼친다. */
  trigger: (state: { open: boolean; triggerProps: FanCollapsibleTriggerProps }) => ReactNode;
  /** 닫혀도 내용을 남긴다(기본 true: 다시 펼칠 때 재마운트·재요청 없음). 닫힌 내용은 inert. */
  keepMounted?: boolean;
  /** 펼침 상태를 이 키로 sessionStorage에 남겨 같은 세션 안 다시 들어와도 유지한다. */
  persistKey?: string;
  className?: string;
  children: ReactNode;
}>;

const STORE_PREFIX = "fan-collapsible:";
const CLOSE_MS = 240;

function readStored(key: string | undefined): boolean | undefined {
  if (!key || typeof window === "undefined") return undefined;
  try {
    const value = window.sessionStorage.getItem(STORE_PREFIX + key);
    return value === "1" ? true : value === "0" ? false : undefined;
  } catch { return undefined; }
}

/** 접기. 높이는 `grid-template-rows 0fr↔1fr` CSS로 바뀌어 JS 측정이 없고 위쪽은 움직이지 않는다. reduced-motion이면 즉시.
 * Base UI `Collapsible.Panel`은 높이를 JS로 재고 닫힌 내용에 `hidden`을 걸어 이 연출과 맞지 않아 같은 aria 계약을 직접 구현한다. */
export function FanCollapsible({ open: controlled, defaultOpen = false, onOpenChange, trigger, keepMounted = true, persistKey, className, children }: FanCollapsibleProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = controlled ?? uncontrolled;
  const panelId = useId();

  // 저장된 값은 첫 렌더 뒤에 읽는다(서버 렌더와 같은 첫 화면).
  useEffect(() => {
    if (controlled !== undefined) return;
    const stored = readStored(persistKey);
    if (stored !== undefined) setUncontrolled(stored);
  }, [controlled, persistKey]);

  const setOpen = useCallback((next: boolean) => {
    if (controlled === undefined) setUncontrolled(next);
    if (persistKey) {
      try { window.sessionStorage.setItem(STORE_PREFIX + persistKey, next ? "1" : "0"); } catch { /* 저장 못 해도 동작은 같다 */ }
    }
    onOpenChange?.(next);
  }, [controlled, onOpenChange, persistKey]);

  const triggerProps: FanCollapsibleTriggerProps = {
    "aria-expanded": open,
    "aria-controls": panelId,
    onClick: () => setOpen(!open),
  };
  // 닫힘 연출(240ms)이 끝나면 내용을 visibility:hidden으로 감춘다. 열 때는 바로 보인다.
  const [hiddenAfterClose, setHiddenAfterClose] = useState(!open);
  useEffect(() => {
    if (open) { setHiddenAfterClose(false); return; }
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setHiddenAfterClose(true), reduced ? 0 : CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  const state = open ? "open" : "closed";
  return <div className={[styles.root, className ?? ""].filter(Boolean).join(" ")} data-state={state} data-fan-collapsible="">
    {trigger({ open, triggerProps })}
    <div id={panelId} className={styles.panel} data-state={state} inert={!open} aria-hidden={open ? undefined : true}>
      <div className={styles.inner} style={!open && hiddenAfterClose ? { visibility: "hidden" } : undefined}>{open || keepMounted ? children : null}</div>
    </div>
  </div>;
}

/** 접기 머리 한 줄: 이름 + 오른쪽 요약(개수·보상 합) + 체브론. 전체가 누르는 영역(최소 44).
 * `className` + `children`을 주면 같은 버튼·aria 계약에 그 모양을 그린다(덕질 미션 목록의 접힌 머리 행, F3). */
export function FanCollapsibleTrigger({ label, meta, className, children, ...triggerProps }: FanCollapsibleTriggerProps & Readonly<{ label?: ReactNode; meta?: ReactNode; className?: string; children?: ReactNode; [key: `data-${string}`]: string | undefined }>) {
  return <button type="button" className={className ?? styles.trigger} {...triggerProps}>
    {children ?? <>
      <span className={styles.triggerLabel}>{label}</span>
      {meta ? <span className={styles.triggerMeta}>{meta}</span> : null}
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </>}
  </button>;
}

/** 함수 prop 없는 접기(서버 컴포넌트에서도 쓴다): 머리 한 줄 `FanCollapsibleTrigger` + 내용. */
export function FanDisclosure({ label, meta, defaultOpen, open, onOpenChange, persistKey, className, children }: Omit<FanCollapsibleProps, "trigger" | "keepMounted"> & Readonly<{ label: ReactNode; meta?: ReactNode }>) {
  return <FanCollapsible defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} persistKey={persistKey} className={className} trigger={({ triggerProps }) => <FanCollapsibleTrigger label={label} meta={meta} {...triggerProps} />}>{children}</FanCollapsible>;
}
