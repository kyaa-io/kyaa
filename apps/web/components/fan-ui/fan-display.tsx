import type { ComponentPropsWithoutRef, ElementType } from "react";
import styles from "./fan-display.module.css";

/**
 * 에디토리얼 디스플레이 글자 역할(이벤트·캠페인 상세 `/s/*` 전용, DESIGN.md 7-2). 앱 탭 화면에는 쓰지 않는다.
 * 굵기는 300(amount·figure 계열)·400(lead·strong·body·caption·mono)·600(title·heading) 셋.
 * amount 화면당 1개 큰 금액 · figure-xl/figure/figure-sm 가는 숫자 3단 · title 칸 제목 · heading 구역 제목 줄
 * lead 큰 라벨 · strong 강조 줄 · body 본문 · caption 보조줄 · mono 순번.
 */
export type FanDisplayRole = "amount" | "figure-xl" | "figure" | "figure-sm" | "title" | "heading" | "lead" | "strong" | "body" | "caption" | "mono";
export type FanDisplayTag = "span" | "p" | "strong" | "dd" | "dt" | "div";

export type FanDisplayProps<T extends FanDisplayTag = "span"> = Readonly<{ role: FanDisplayRole; as?: T }> & Omit<ComponentPropsWithoutRef<T>, "role" | "as">;

/** 화면 CSS는 크기·굵기·행간을 쓰지 않고 역할만 고른다(design-lint N33). */
export function FanDisplay<T extends FanDisplayTag = "span">({ role, as, className, ...rest }: FanDisplayProps<T>) {
  const Tag = (as ?? "span") as ElementType;
  return <Tag className={[styles.display, styles[role], className ?? ""].filter(Boolean).join(" ")} data-fan-display={role} {...rest} />;
}
