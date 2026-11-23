import type { AppLocale } from "@/i18n/locales";
import Image from "next/image";
import { fanStageLabel, fanTierEntryKey, type FanStage, type FanStageKey } from "../domain/fan-stage";

type Props = {
  tier: FanStage["tier"];
  stageKey?: FanStageKey | null;
  locale: AppLocale;
  size: number;
  adjacentLabel?: boolean;
  className?: string;
};

/** Tier badge artwork (medal-v2, 11/23): one colour and silhouette per tier, stage dots inside. */
export const fanTierBadgeSrc = (key: string) => `/images/passport/tiers/medal-v2/${key}.svg`;

export function FanTierBadge({ tier, stageKey, locale, size, adjacentLabel = true, className }: Props) {
  const key = stageKey ?? fanTierEntryKey(tier);
  const label = fanStageLabel(locale, { tier, subdivision: Number(key.split("-").at(-1)) });
  return <Image
    className={className}
    unoptimized
    src={fanTierBadgeSrc(key)}
    width={size}
    height={size}
    alt={adjacentLabel ? "" : `${label} fan tier`}
    aria-hidden={adjacentLabel ? "true" : undefined}
  />;
}
