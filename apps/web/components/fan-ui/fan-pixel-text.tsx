import type { ComponentPropsWithoutRef } from "react";
import styles from "./fan-pixel-text.module.css";

export type FanPixelTextRole = "score" | "result" | "say" | "float" | "sub";

/** For nodes a game adds outside React (score pop-ups on the field). */
export function fanPixelTextClassName(role: FanPixelTextRole, className = "") {
  return [styles.pixel, styles[role], className].filter(Boolean).join(" ");
}

/** 도트 글자. 케미 게임의 점수(score·result)·보조 수치(sub)·판 위 한마디(say·float)에만 쓴다. */
export function FanPixelText({ role, as: Tag = "span", className, ...rest }: Readonly<{ role: FanPixelTextRole; as?: "span" | "strong" | "p" }> & Omit<ComponentPropsWithoutRef<"span">, "role">) {
  return <Tag className={fanPixelTextClassName(role, className)} data-fan-pixel-text={role} {...rest} />;
}
