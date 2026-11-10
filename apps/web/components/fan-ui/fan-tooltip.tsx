"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import styles from "./fan-tooltip.module.css";

/** 마우스·트랙패드 같은 정밀 포인터인지. 서버와 첫 렌더는 false(툴팁 없이 그린다). */
export function useFanFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFine(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return fine;
}

export type FanTooltipProps = Readonly<{
  /** 짧은 이름표. 설명 문장은 `FanHelpTip`을 쓴다. */
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  /** 터치 기기에서 길게 누르면 잠깐 뜬다. 마우스는 호버·포커스. */
  longPress?: boolean;
  /** 속성(aria·ref·이벤트)을 DOM에 그대로 넘기는 요소(네이티브 버튼·링크). */
  children: ReactElement;
}>;

const LONG_PRESS_MS = 450;
const LONG_PRESS_SHOWN_MS = 1800;

/** 터치용: 450ms 누르고 있으면 이름표가 1.8초 뜬다. 누른 채 움직여 스크롤이 시작되면(pointercancel) 뜨지 않는다. */
function LongPressTooltip({ content, side, children }: Pick<FanTooltipProps, "content" | "children"> & { side: NonNullable<FanTooltipProps["side"]> }) {
  const [open, setOpen] = useState(false);
  const press = useRef<number>(undefined);
  const hide = useRef<number>(undefined);
  const cancel = () => window.clearTimeout(press.current);
  useEffect(() => () => { window.clearTimeout(press.current); window.clearTimeout(hide.current); }, []);
  return <Tooltip.Root open={open} onOpenChange={next => { if (!next) setOpen(false); }}>
    <Tooltip.Trigger render={children}
      onPointerDown={event => {
        if (event.pointerType === "mouse") return;
        cancel();
        press.current = window.setTimeout(() => { setOpen(true); window.clearTimeout(hide.current); hide.current = window.setTimeout(() => setOpen(false), LONG_PRESS_SHOWN_MS); }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onContextMenu={event => event.preventDefault()} />
    <Tooltip.Portal>
      <Tooltip.Positioner className={styles.positioner} side={side} sideOffset={8} collisionPadding={12}>
        <Tooltip.Popup className={styles.popup} data-fan-tooltip="">{content}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}

/** 호버·포커스 이름표. 터치 기기에서는 `longPress`일 때만 길게 눌러 뜨고, 아니면 그리지 않으므로 뜻은 `aria-label`이나 보이는 글자가 따로 가져야 한다. */
export function FanTooltip({ content, side = "top", delay = 300, longPress = false, children }: FanTooltipProps) {
  const fine = useFanFinePointer();
  if (!fine) return longPress ? <LongPressTooltip content={content} side={side}>{children}</LongPressTooltip> : children;
  return <Tooltip.Root>
    <Tooltip.Trigger render={children} delay={delay} />
    <Tooltip.Portal>
      <Tooltip.Positioner className={styles.positioner} side={side} sideOffset={8} collisionPadding={12}>
        <Tooltip.Popup className={styles.popup} data-fan-tooltip="">{content}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
