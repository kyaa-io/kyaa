import styles from "./fan-count-chip.module.css";

/** 탭·섹션 머리의 숫자(12 회색 글자, 칩 아님 — 5차 8장 ⑩). 0이면 그리지 않는다(S4 규칙 3). 99를 넘으면 `99+`. */
export function FanCount({ value, unit, tone = "neutral", max = 99, className }: Readonly<{
  value: number;
  unit?: string;
  tone?: "neutral" | "accent";
  max?: number;
  className?: string;
}>) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const text = value > max ? `${max}+` : String(value);
  return <span className={[styles.count, className ?? ""].filter(Boolean).join(" ")} data-tone={tone} data-number-role="count" data-count="">{text}{unit ? <span>{unit}</span> : null}</span>;
}
