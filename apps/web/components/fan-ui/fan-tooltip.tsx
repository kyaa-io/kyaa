"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
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
  /** 속성(aria·ref·이벤트)을 DOM에 그대로 넘기는 요소(네이티브 버튼·링크). */
  children: ReactElement;
}>;

/** 호버·포커스 전용 이름표. 터치 기기에서는 그리지 않으므로 뜻은 `aria-label`이나 보이는 글자가 따로 가져야 한다. */
export function FanTooltip({ content, side = "top", delay = 300, children }: FanTooltipProps) {
  const fine = useFanFinePointer();
  if (!fine) return children;
  return <Tooltip.Root>
    <Tooltip.Trigger render={children} delay={delay} />
    <Tooltip.Portal>
      <Tooltip.Positioner className={styles.positioner} side={side} sideOffset={8} collisionPadding={12}>
        <Tooltip.Popup className={styles.popup} data-fan-tooltip="">{content}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
