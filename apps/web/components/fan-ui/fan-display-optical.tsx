"use client";
import { useEffect, useRef, type ElementType, type HTMLAttributes } from "react";

/**
 * 첫 글자의 왼쪽 잉크 시작(사이드 베어링)을 em 단위로 잰다. 글꼴이 그리는 실제 윤곽을 캔버스 글자 측정으로 읽는다.
 * 잴 수 없으면(글자 없음·오른쪽에서 왼쪽 쓰기·캔버스 없음) null: CSS의 굵기별 기본값이 그대로 쓰인다.
 */
export function fanDisplayInkStart(element: HTMLElement, context: Pick<CanvasRenderingContext2D, "font" | "measureText"> | null): number | null {
  const first = Array.from(element.textContent?.trimStart() ?? "")[0];
  if (!first || !context) return null;
  const style = getComputedStyle(element);
  if (style.direction === "rtl") return null;
  // 100px에서 재서 em으로 바꾼다: 폭에 따라 글자 크기가 바뀌어도 다시 재지 않는다.
  context.font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} 100px ${style.fontFamily}`;
  const ink = -context.measureText(first).actualBoundingBoxLeft / 100;
  return Number.isFinite(ink) ? Math.min(.2, Math.max(-.05, Math.round(ink * 1000) / 1000)) : null;
}

/** `FanDisplay optical`의 브라우저 쪽: 글꼴이 준비되면 첫 글자를 재서 `--fan-display-ink-start`(em 배수)로 넘긴다. 직접 쓰지 않는다. */
export function FanDisplayOptical({ tag, ...rest }: { tag: string } & HTMLAttributes<HTMLElement>) {
  const Tag = tag as ElementType;
  const ref = useRef<HTMLElement>(null);
  const text = typeof rest.children === "string" ? rest.children : undefined;
  useEffect(() => {
    const element = ref.current, fonts = typeof document === "undefined" ? undefined : document.fonts;
    // 글꼴 목록이 없는 환경(테스트 DOM)에서는 재지 않는다.
    if (!element || !fonts) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const ink = fanDisplayInkStart(element, document.createElement("canvas").getContext("2d"));
      if (ink === null) element.style.removeProperty("--fan-display-ink-start");
      else element.style.setProperty("--fan-display-ink-start", String(ink));
    };
    measure();
    void fonts.ready.then(measure);
    fonts.addEventListener?.("loadingdone", measure);
    return () => { live = false; fonts.removeEventListener?.("loadingdone", measure); };
  }, [text]);
  return <Tag ref={ref} {...rest} />;
}
