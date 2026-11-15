"use client";
import { UserCheck } from "lucide-react";
import type { Route } from "next";
import Link from "./hover-prefetch-link";

import styles from "./fan-star-action.module.css";

export type FanStarActionProps = Readonly<{
  /** `filled`: 인증했거나 가입한 상태. 그 밖은 `empty`(비로그인 포함). */
  state: "empty" | "filled";
  label: string;
  href?: string;
  onClick?: () => void;
  pending?: boolean;
  /** 지금 누를 수 없는 이유. 라벨 옆에 읽히도록 접근성 설명으로 붙인다. */
  reason?: string;
  className?: string;
}>;

/** 머리의 팬 인증·가입 칩(Q1). 별은 페이지 좋아요가 쓰므로 사람 체크 아이콘을 쓴다(대표 11/15 16:45). 강조 버튼이 아니다. href와 onClick이 모두 없으면 상태만 보여 주는 표시다(가입함). */
export function FanStarAction({ state, label, href, onClick, pending = false, reason, className }: FanStarActionProps) {
  const cls = [styles.star, className ?? ""].filter(Boolean).join(" ");
  const content = <><UserCheck size={16} strokeWidth={1.5} aria-hidden="true" className={styles.icon} /><span>{label}</span></>;
  const shared = { className: cls, "data-fan-star": state, "aria-busy": pending || undefined, title: reason } as const;
  if (href && !pending) return <Link {...shared} href={href as Route}>{content}</Link>;
  if (onClick || href) return <button {...shared} type="button" aria-disabled={pending || undefined} onClick={() => { if (!pending) onClick?.(); }}>{content}</button>;
  return <span {...shared}>{content}</span>;
}
