import Image from "next/image";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanBackAction } from "@/components/fan-ui/fan-back-action";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import type { AppLocale } from "@/i18n/locales";
import { FAN_STAGE_KEYS, fanStageLabel, type FanStage } from "../domain/fan-stage";
import { FAN_TIERS } from "../domain/reward-policy";
import { FanTierBadge } from "./fan-tier-badge";
import { tierGuideCopy } from "./tier-guide-copy";
import styles from "./tier-guide.module.css";
// Policy v3; source and local dev verification are recorded in tier-facts.md.
const minimumHearts = [0, 0, 0, 1, 8, 11, 14, 17, 20, 24, 28];
export function TierGuide({ locale }: { locale: AppLocale }) {
  const c = tierGuideCopy(locale);
  return <article className={styles.page}>
    <FanBackAction locale={locale} fallbackHref={`/notices?locale=${locale}`} />
    <FanHeading as="h1">{c.title}</FanHeading>
    <figure className={styles.visual}><Image className={styles.hero} src="/images/guides/tier-guide.webp" width={1200} height={800} alt="" unoptimized /><FanText as="p" role="body" className={styles.rule}>{c.rule}</FanText></figure>
    <section className={styles.section}>
      <FanHeading as="h2">{c.attainment}</FanHeading>
      <table className={styles.table}>
        <thead><tr><th><FanText role="label">{c.system}</FanText></th><th><FanText role="label">{c.requirements}</FanText></th></tr></thead>
        <tbody>{FAN_TIERS.map(tier => <tr key={tier}>
          <th scope="row"><span className={styles.tier}><FanTierBadge tier={tier} locale={locale} size={32} /><FanText role="item">{levelLabel(locale, tier)}</FanText></span></th>
          <td><ul className={styles.conditions}>{FAN_STAGE_KEYS.flatMap((key, index) => {
            if (!key.startsWith(tier.toLowerCase() + "-")) return [];
            const stage = { tier, subdivision: Number(key.split("-")[1]) } as FanStage;
            const requirement = index === 0 ? c.initial : index < 3 ? `${c.hearts} 0 · ${c.minimum(c.stamps, index === 1 ? 3 : 6)}` : c.minimum(c.hearts, minimumHearts[index]);
            return [<li data-row="tier-stage" className={styles.condition} key={key} data-tier-stage={key}>
              {tier !== "Bronze" && tier !== "Diamond" ? <FanText role="label" aria-label={fanStageLabel(locale, stage)}>{stage.subdivision}</FanText> : <span aria-hidden="true"/>}
              <FanText role="body">{requirement}</FanText>
            </li>];
          })}</ul></td>
        </tr>)}</tbody>
      </table>
    </section>
  </article>;
}
