import type { ComponentPropsWithoutRef, ElementType } from "react";
import { FanDisplayOptical } from "./fan-display-optical";
import styles from "./fan-display.module.css";

/**
 * 에디토리얼 디스플레이 글자 역할(이벤트·캠페인 상세 `/s/*` 전용, DESIGN.md 7-2). 앱 탭 화면에는 쓰지 않는다.
 * 굵기는 300(amount·figure 계열)·400(lead·strong·body·caption·mono)·600(title·heading) 셋.
 * amount 화면당 1개 큰 금액 · figure-xl/figure/figure-sm 가는 숫자 3단 · title 칸 제목 · heading 구역 제목 줄
 * lead 큰 라벨 · strong 강조 줄 · body 본문 · caption 보조줄 · mono 순번.
 */
export type FanDisplayRole = "amount" | "figure-xl" | "figure" | "figure-sm" | "title" | "heading" | "lead" | "strong" | "body" | "caption" | "mono";
export type FanDisplayTag = "span" | "p" | "strong" | "dd" | "dt" | "div";

export type FanDisplayProps<T extends FanDisplayTag = "span"> = Readonly<{
  role: FanDisplayRole; as?: T;
  /**
   * 큰 글자 줄 왼쪽 광학 정렬(DESIGN.md 7-2). 왼쪽 정렬로 쌓이는 줄의 첫 글자 잉크가 칸 왼쪽 선에 닿게 한다.
   * 글자마다 왼쪽 여백(사이드 베어링)이 크기에 비례해서 달라 `K`(24px)·`신`(40px)·`1`(16px)이 같은 x에서 시작해도 어긋나 보이기 때문이다.
   * 줄의 맨 앞에 오는 글자에만 쓴다(줄 중간 글자에 쓰면 앞 글자와의 사이가 좁아진다).
   */
  optical?: boolean;
}> & Omit<ComponentPropsWithoutRef<T>, "role" | "as">;

/** 화면 CSS는 크기·굵기·행간을 쓰지 않고 역할만 고른다(design-lint N33). */
export function FanDisplay<T extends FanDisplayTag = "span">({ role, as, optical, className, ...rest }: FanDisplayProps<T>) {
  const Tag = (as ?? "span") as ElementType;
  const names = [styles.display, styles[role], optical ? styles.optical : "", className ?? ""].filter(Boolean).join(" ");
  if (optical) return <FanDisplayOptical tag={as ?? "span"} className={names} data-fan-display={role} data-fan-display-optical="" {...rest} />;
  return <Tag className={names} data-fan-display={role} {...rest} />;
}
