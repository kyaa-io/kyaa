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

/** The favorite is the one the fan named in MY (fan_profile_public_fields, `summary.favorite`) and nothing else: the header, the 덕질 bar,
 * the fan list, the ranking and the profile card all read that one value. It counts here while its passport exists; otherwise there is none. */
export function pickSelectedBias(options: readonly SelectedBiasOption[], named: string | null | undefined): SelectedBiasOption | null {
  return named ? options.find((option) => option.slug === named) ?? null : null;
}

/** Which passport a screen opens when the fan named no favorite (MY's card, the guide's progress). Not a favorite: nothing shows it as one.
 * It must not follow the summary's order, which sorts by the localized name (261107-2 H-1): highest stage first, then slug. */
export function defaultPassport(options: readonly SelectedBiasOption[]): SelectedBiasOption | null {
  return options.reduce<SelectedBiasOption | null>((best, option) => {
    if (!best) return option;
    const byStage = stageRank(option) - stageRank(best);
    return byStage > 0 || (byStage === 0 && option.slug < best.slug) ? option : best;
  }, null);
}
