"use client";

import { CircleHelp } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FanSheet } from "./fan-dialog";
import { useFanFinePointer } from "./fan-tooltip";
import styles from "./fan-help-tip.module.css";

const GAP = 8;
const GUTTER = 12;
const MAX_WIDTH = 280;

/** 물음표 도움말. 마우스는 호버·포커스로 말풍선(최대 폭 280), 터치는 눌러서 바닥 시트. 설명 문장은 화면에 쓰지 않고 이 뒤로 보낸다. */
export function FanHelpTip({ label, title, closeLabel, children }: { label: string; title: string; closeLabel: string; children: ReactNode }) {
  const fine = useFanFinePointer();
  const [hovering, setHovering] = useState(false);
  const [modal, setModal] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setHovering(false), []);

  useLayoutEffect(() => {
    if (!hovering || !trigger.current) { setPosition(undefined); return; }
    const box = trigger.current.getBoundingClientRect();
    const width = Math.min(MAX_WIDTH, window.innerWidth - GUTTER * 2);
    const height = tip.current?.offsetHeight ?? 0;
    const left = Math.min(window.innerWidth - GUTTER - width, Math.max(GUTTER, box.left + box.width / 2 - width / 2));
    const below = box.bottom + GAP + height <= window.innerHeight - GUTTER;
    setPosition({ left, top: below ? box.bottom + GAP : Math.max(GUTTER, box.top - GAP - height) });
  }, [hovering]);

  useEffect(() => {
    if (!hovering) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", close, true); };
  }, [hovering, close]);

  return <>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={label} aria-describedby={hovering ? id : undefined} aria-haspopup={fine ? undefined : "dialog"}
      onMouseEnter={() => { if (fine) setHovering(true); }} onMouseLeave={close}
      onFocus={() => { if (fine) setHovering(true); }} onBlur={close}
      onClick={() => { if (fine) setHovering(true); else setModal(true); }}>
      <CircleHelp aria-hidden="true" />
    </button>
    {hovering && typeof document !== "undefined" ? createPortal(
      <div ref={tip} id={id} role="tooltip" className={styles.tip} data-placed={position ? "true" : undefined} style={position ? { "--tip-left": `${position.left}px`, "--tip-top": `${position.top}px` } as React.CSSProperties : undefined}>
        {children}
      </div>, document.body) : null}
    <FanSheet open={modal} onOpenChange={setModal} title={title} closeLabel={closeLabel} side="bottom">{children}</FanSheet>
  </>;
}
