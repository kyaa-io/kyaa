import type { CSSProperties } from "react";
import styles from "./fan-cell-gauge.module.css";

export type FanCellGaugeProps = Readonly<{
  /** 왼쪽 그림(잉크병·스탬프·하트). 장식이라 aria-hidden으로 그린다. */
  icon: string;
  /** 트랙 위 한 줄. 값을 말하는 글자는 이 줄 하나뿐이다. */
  text: string;
  /** progressbar 이름. */
  label: string;
  /** 칸 수. */
  cells: number;
  /** 찬 칸 수. */
  filled: number;
  className?: string;
}>;

/** 그림 + 둥근 트랙 안 칸 분할 게이지. 채운 칸은 강조색, 빈 칸은 옅은 핑크. 처음 보일 때 칸이 하나씩 찬다(reduced-motion은 즉시). */
export function FanCellGauge({ icon, text, label, cells, filled, className }: FanCellGaugeProps) {
  const total = Math.max(1, Math.round(cells));
  const done = Math.min(total, Math.max(0, Math.round(filled)));
  return <div className={[styles.row, className ?? ""].filter(Boolean).join(" ")}>
    <img className={styles.icon} src={icon} alt="" aria-hidden="true" width={44} height={44} loading="lazy" decoding="async" />
    <div className={styles.main}>
      <span className={styles.text}>{text}</span>
      <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={text}>
        {Array.from({ length: total }, (_, index) => <i key={index} className={styles.cell} data-filled={index < done ? "true" : undefined} style={{ "--cell-index": index } as CSSProperties} />)}
      </div>
    </div>
  </div>;
}
