import type { LucideIcon, LucideProps } from "lucide-react";

export type FanIconSize = 16 | 20 | 24;

/** The one UI icon set (DESIGN §4 아이콘, 8장 ⑫): lucide, 1.5px stroke, 16·20·24 only. Screens pass the lucide icon here instead of
 * drawing it themselves, so every icon carries the same stroke and the `data-icon`·`data-icon-set` marks the checks read.
 * `filled` paints the shape in the current colour (only the heart uses it). Decorative unless `label` is given. */
export function FanIcon({ icon: Icon, size = 20, label, filled = false, className, ...rest }: Readonly<{
  icon: LucideIcon;
  size?: FanIconSize;
  label?: string;
  filled?: boolean;
  className?: string;
}> & Omit<LucideProps, "size" | "strokeWidth" | "ref" | "fill">) {
  const name = (Icon.displayName ?? "icon").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return <Icon
    {...rest}
    size={size}
    strokeWidth={1.5}
    absoluteStrokeWidth={false}
    fill={filled ? "currentColor" : "none"}
    className={className}
    data-icon={name}
    data-icon-set="lucide"
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? "img" : undefined}
    focusable="false"
  />;
}
