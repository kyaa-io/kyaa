import type { ReactNode } from "react";
import styles from "./fan-num-unit.module.css";

/** 숫자와 단위를 한 덩어리로 묶는다(`1,230만`, `107명`, `20.9M`, `+30 점`). 좁은 카드에서도 줄 중간에서 갈라지지 않는다.
 * 자산 숫자는 `FanNumber`가 이미 같은 규칙을 가진다. 글 속의 숫자+단위, 목록 카드의 수치는 이 요소로 감싼다. */
export function FanNumUnit({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <span className={[styles.numUnit, className ?? ""].filter(Boolean).join(" ")} data-num-unit="">{children}</span>;
}
