import type { ComponentPropsWithoutRef, ElementType } from "react";
import styles from "./fan-surface.module.css";

export const fanUtilityCanvasClassName = styles.canvas;
type Props = ComponentPropsWithoutRef<"section"> & { as?: Extract<ElementType, "section" | "div">; tone?: "default" | "focus"; appearance?: "card" | "list" | "plain" };
/**
 * Static surface only. Actions retain FanAction and their own focus treatment.
 * `list` is the same card without padding for rows that carry their own padding and divider (notices, feeds, rankings).
 * A screen section is either this card or a media tile grid; never a bare divider list next to cards (R2).
 */
export function FanSurface({ as: Tag = "section", tone = "default", appearance = "card", className, ...props }: Props) {
  return <Tag {...props} className={[styles.card, className].filter(Boolean).join(" ")} data-fan-surface-card data-tone={tone} data-appearance={appearance} />;
}
