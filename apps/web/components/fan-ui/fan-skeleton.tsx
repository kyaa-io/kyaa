import type { CSSProperties } from "react";
import styles from "./fan-skeleton.module.css";

type Length = number | string;
const size = (value: Length | undefined) => (typeof value === "number" ? `${value}px` : value);

/** One loading bar (main's FanSkeleton, production tokens). It holds its place at once and only shows after 150ms. */
export function FanSkeleton({ shape = "text", width, height, className }: Readonly<{ shape?: "text" | "block" | "circle"; width?: Length; height?: Length; className?: string }>) {
  return <span aria-hidden="true" data-fan-skeleton-bar="" className={[styles.bar, styles[shape], className ?? ""].filter(Boolean).join(" ")} style={{ width: size(width), height: size(height) } as CSSProperties} />;
}
