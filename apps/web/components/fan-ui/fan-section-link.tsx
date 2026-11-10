import type { ReactNode } from "react";
import { FanAction } from "./fan-action";
import styles from "./fan-section-link.module.css";

/** 섹션 머리 행동: 글자 링크 + 글자 '›'. 알약·테두리·아이콘 버튼 금지(design-lint N31). */
export function FanSectionLink({ href, onClick, expanded, controls, className, ariaLabel, children }: {
  /** 이동 링크. `onClick`과 함께 쓰지 않는다. */
  href?: string;
  /** 같은 화면에서 펼치는 행동(href 없이). `expanded`·`controls`로 상태를 알린다. */
  onClick?: () => void;
  expanded?: boolean;
  controls?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const label = <>{children}<span className={styles.more} aria-hidden="true">›</span></>;
  if (href === undefined) return <FanAction variant="text" className={className} onClick={onClick} aria-expanded={expanded} aria-controls={controls} ariaLabel={ariaLabel}>{label}</FanAction>;
  return <FanAction variant="text" className={className} href={href} ariaLabel={ariaLabel}>{label}</FanAction>;
}
