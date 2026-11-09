import type { ReactNode } from "react";
import { FanAction } from "./fan-action";
import styles from "./fan-section-link.module.css";

/** 섹션 머리 행동: 글자 링크 + 글자 '›'. 알약·테두리·아이콘 버튼 금지(design-lint N31). */
export function FanSectionLink({ href, className, ariaLabel, children }: {
  href: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return <FanAction variant="text" className={className} href={href} ariaLabel={ariaLabel}>{children}<span className={styles.more} aria-hidden="true">›</span></FanAction>;
}
