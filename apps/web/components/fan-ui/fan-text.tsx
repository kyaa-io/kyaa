import type { ComponentPropsWithoutRef, ElementType } from "react";
import styles from "./fan-text.module.css";

export type FanTextRole = "item" | "row-title" | "body" | "meta" | "label";
export type FanTextTag = "span" | "p" | "strong" | "time" | "dd" | "dt" | "div";

export type FanTextProps<T extends FanTextTag = "span"> = Readonly<{
  /** item 16/700 항목 이름 · row-title 16/400 글 행 제목 · body 16/400 본문 · meta 13/400 보조줄 · label 13/700 라벨. */
  role: FanTextRole;
  as?: T;
}> & Omit<ComponentPropsWithoutRef<T>, "role" | "as">;

/** 글자 역할 한 곳. 화면은 크기·굵기·행간을 직접 쓰지 않고 역할만 고른다. */
export function FanText<T extends FanTextTag = "span">({ role, as, className, ...rest }: FanTextProps<T>) {
  const Tag = (as ?? "span") as ElementType;
  return <Tag className={[styles[role], className ?? ""].filter(Boolean).join(" ")} data-fan-text={role} {...rest} />;
}
