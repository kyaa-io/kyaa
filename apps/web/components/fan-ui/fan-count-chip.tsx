import styles from "./fan-count-chip.module.css";

/** 알림·댓글 수 같은 숫자 칩(12/700, 높이 18, 알약). 0이면 그리지 않는다(S4 규칙 3). 99를 넘으면 `99+`. */
export function FanCount({ value, unit, tone = "neutral", max = 99, className }: Readonly<{
  value: number;
  unit?: string;
  tone?: "neutral" | "accent";
  max?: number;
  className?: string;
}>) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const text = value > max ? `${max}+` : String(value);
  return <span className={[styles.count, className ?? ""].filter(Boolean).join(" ")} data-tone={tone} data-number-role="count">{text}{unit ? <span>{unit}</span> : null}</span>;
}
