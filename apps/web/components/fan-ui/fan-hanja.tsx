import type { ComponentPropsWithoutRef } from "react";
import styles from "./fan-hanja.module.css";

/**
 * 사주 한자(천간·지지·오행). 케미 사주 결과의 명식표·간지 칩·십신 글자에만 쓴다(DESIGN.md 7절 FanHanja).
 * glyph 명식표 한 글자 32 · pair 간지 칩 24 · letters 십신 글자 18 · inline 둘레 글자 크기 그대로. 굵기는 모두 400.
 * 글꼴은 본문과 같다(한자 전용 글꼴은 승인 전).
 */
export type FanHanjaRole = "glyph" | "pair" | "letters" | "inline";

export function FanHanja({ role, className, ...rest }: Readonly<{ role: FanHanjaRole }> & Omit<ComponentPropsWithoutRef<"span">, "role">) {
  return <span className={[styles.hanja, styles[role], className ?? ""].filter(Boolean).join(" ")} data-fan-hanja={role} {...rest} />;
}
