import { passportBookText } from "@/features/passport/ui/passport-book-copy";
import type { AppLocale } from "@/i18n/locales";
import { fanStageLabel, fanTierName, type FanStageProgress } from "../domain/fan-stage";

/** The one wording of "how far to the next stage", from the server's stage progress only (BUGS-1846 T2): "실버까지 도장 1칸",
 * "골드까지 하트 1개", "골드 2까지 하트 5개". Entering a new tier names the tier; a step inside a tier names the stage. Points remain only
 * for policies 1 and 2. Null at the top stage. */
export function fanStageNextText(locale: AppLocale, stage: FanStageProgress): string | null {
  if (!stage.next) return null;
  const target = stage.next.subdivision === 1 ? fanTierName(locale, stage.next.tier) : fanStageLabel(locale, stage.next);
  const key = stage.unit === "stamps" ? "tierToNextStamps" : stage.unit === "hearts" ? "tierToNextHearts" : "tierToNext";
  return passportBookText(locale, key, [target, stage.remaining.toLocaleString(locale)]);
}
