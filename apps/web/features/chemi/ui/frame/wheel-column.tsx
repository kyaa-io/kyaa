"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import styles from "./birth-frame.module.css";

export type WheelOption = Readonly<{ value: number; label: string }>;

const FALLBACK_ROW = 44;

/**
 * 숫자 휠 한 줄(생일 숫자 입력 + 휠 공통 부품). 줄 높이 44에 다섯 줄이 보이고 가운데 줄이 고른 값이다.
 * 스크롤 스냅으로 고르고, 위·아래 화살표 키로 한 줄씩 옮긴다(spinbutton). 줄을 누르면 그 줄로 온다.
 * 값은 바깥이 쥐고(value), 선택 개수가 바뀌면(달마다 날 수가 다름) 고른 값을 가장 가까운 줄에 둔다.
 */
export function WheelColumn({ label, options, value, onChange, autoFocus }: Readonly<{
  label: string;
  options: readonly WheelOption[];
  value: number;
  onChange: (value: number) => void;
  autoFocus?: boolean;
}>) {
  const column = useRef<HTMLDivElement>(null);
  const settled = useRef(value);
  const rowHeight = () => column.current?.firstElementChild?.getBoundingClientRect().height || FALLBACK_ROW;
  const indexOf = (target: number) => Math.max(0, options.findIndex((option) => option.value === target));

  // 바깥 값이 바뀌었을 때만(처음 · 옵션 수 변경 · 다른 휠이 바꿈) 스크롤을 맞춘다. 사용자가 굴려서 바뀐 값은 이미 그 자리다.
  useLayoutEffect(() => {
    const node = column.current;
    if (!node) return;
    const target = indexOf(value) * rowHeight();
    if (Math.abs(node.scrollTop - target) > 1) node.scrollTop = target;
    settled.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length]);
  useEffect(() => { if (autoFocus) column.current?.focus({ preventScroll: true }); }, [autoFocus]);

  const current = indexOf(value);
  const onScroll = () => {
    const node = column.current;
    if (!node) return;
    const index = Math.max(0, Math.min(options.length - 1, Math.round(node.scrollTop / rowHeight())));
    const next = options[index].value;
    if (next !== settled.current) { settled.current = next; onChange(next); }
  };
  const move = (steps: number) => { if (column.current) column.current.scrollTop += steps * rowHeight(); };

  return <div
    ref={column}
    className={styles.wheelColumn}
    role="spinbutton"
    tabIndex={0}
    aria-label={label}
    aria-valuemin={1}
    aria-valuemax={options.length}
    aria-valuenow={current + 1}
    aria-valuetext={options[current]?.label}
    onScroll={onScroll}
    onKeyDown={(event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      move(event.key === "ArrowUp" ? -1 : 1);
    }}
  >
    {options.map((option, index) => <div key={option.value} data-on={index === current ? "" : undefined} onClick={() => { if (column.current) column.current.scrollTop = index * rowHeight(); }}>{index === current ? <b>{option.label}</b> : option.label}</div>)}
  </div>;
}
