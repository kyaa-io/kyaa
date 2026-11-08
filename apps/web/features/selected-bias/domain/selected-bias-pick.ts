import type { MySummary } from "@/features/my/domain/my-summary";
import { FAN_STAGE_KEYS, fanTierEntryKey, type FanStage, type FanStageKey } from "@/features/rewards/domain/fan-stage";

export type SelectedBiasOption = {
  slug: string;
  name: string;
  image: string;
  imagePosition?: string;
  passportId: string;
  tier: FanStage["tier"];
  stage: { key: FanStageKey; tier: FanStage["tier"]; subdivision: number } | null;
  /** Hearts collected in this community (summary `hearts=1`); absent when the server did not give them. */
  hearts?: number;
};

export function selectedBiasOptions(summary: MySummary | undefined): SelectedBiasOption[] {
  return (summary?.creators ?? []).flatMap((creator) => {
    if (!creator.passport) return [];
    const current = creator.passport.stageProgress?.current;
    return [{
      slug: creator.celebrity.slug, name: creator.celebrity.name, image: creator.celebrity.image, imagePosition: creator.celebrity.imagePosition,
      passportId: creator.passport.id, tier: creator.passport.tier,
      stage: current ? { key: current.key, tier: current.tier, subdivision: current.subdivision } : null,
      ...(creator.passport.hearts === undefined ? {} : { hearts: creator.passport.hearts }),
    }];
  });
}

const stageRank = (option: SelectedBiasOption) => FAN_STAGE_KEYS.indexOf(option.stage?.key ?? fanTierEntryKey(option.tier));

/** The favorite named in MY (server, D's fan_profile_public_fields) comes first when it is one of the passports; then the browser's stored
 * choice; then, without either, the default must not follow the summary's order: it sorts creators by their localized name,
 * so "the first passport" was a different favorite in ko and en (261107-2 H-1). Highest stage first, then slug. */
export function pickSelectedBias(options: readonly SelectedBiasOption[], stored: string | null, named?: string | null): SelectedBiasOption | null {
  const chosen = named ? options.find((option) => option.slug === named) : undefined;
  if (chosen) return chosen;
  const kept = options.find((option) => option.slug === stored);
  if (kept) return kept;
  return options.reduce<SelectedBiasOption | null>((best, option) => {
    if (!best) return option;
    const byStage = stageRank(option) - stageRank(best);
    return byStage > 0 || (byStage === 0 && option.slug < best.slug) ? option : best;
  }, null);
}

