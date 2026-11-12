"use client";
import { Star } from "lucide-react";
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

/** 머리의 별 버튼(Q1). 강조 버튼이 아니다. href와 onClick이 모두 없으면 상태만 보여 주는 표시다(가입함). */
export function FanStarAction({ state, label, href, onClick, pending = false, reason, className }: FanStarActionProps) {
  const cls = [styles.star, className ?? ""].filter(Boolean).join(" ");
  const content = <><Star size={16} fill={state === "filled" ? "currentColor" : "none"} aria-hidden="true" className={styles.icon} /><span>{label}</span></>;
  const shared = { className: cls, "data-fan-star": state, "aria-busy": pending || undefined, title: reason } as const;
  if (href && !pending) return <Link {...shared} href={href as Route}>{content}</Link>;
  if (onClick || href) return <button {...shared} type="button" aria-disabled={pending || undefined} onClick={() => { if (!pending) onClick?.(); }}>{content}</button>;
  return <span {...shared}>{content}</span>;
}
