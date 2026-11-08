import { ChevronDown, ChevronUp, Minus } from "lucide-react";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { AppLocale } from "@/i18n/locales";
import { rankingsText } from "./rankings-copy";
import styles from "./rank-delta.module.css";

/** Movement against yesterday (feedback C3). Icons instead of ▲▼ glyphs, so the 36px column does not shift between fonts; only the number is text.
 * null (first seven days, new in the list) and 0 both read as "no change". */
export function RankDelta({ delta, locale }: { delta: number | null; locale: AppLocale }) {
  const value = delta ?? 0;
  const label = value > 0 ? rankingsText(locale, "rkDeltaUp", [value]) : value < 0 ? rankingsText(locale, "rkDeltaDown", [-value]) : rankingsText(locale, "rkDeltaSame");
  return <span className={styles.delta} data-direction={value > 0 ? "up" : value < 0 ? "down" : "same"} role="img" aria-label={label}>
    <FanIcon icon={value > 0 ? ChevronUp : value < 0 ? ChevronDown : Minus} size={16} />
    {value !== 0 ? <span aria-hidden="true">{Math.abs(value).toLocaleString(locale)}</span> : null}
  </span>;
}
