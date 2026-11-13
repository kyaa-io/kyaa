"use client";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { PassportBookBody, usePassportBook } from "@/features/my/ui/my-passport-card";
import { myHomeText } from "@/features/my/ui/my-home-copy";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import type { SelectedBiasOption } from "@/features/selected-bias/domain/selected-bias-pick";
import { fanStageLabel } from "@/features/rewards/domain/fan-stage";
import type { AppLocale } from "@/i18n/locales";
import myStyles from "@/features/my/ui/my-passport-card.module.css";
import styles from "./stan-passport-book.module.css";

/** 덕질 미션 head (사용자 11/13 13:2x): 덕질 기록 is the favorite's passport as MY draws it — the passport art with the stamped slots, the tier,
 *  the stamp gauge and the nine mission-book slots — the same `PassportBookBody` MY uses, under the section's own title. It needs the
 *  DukjilProvider above it (the book is read only while the mission policy is on). */
export function StanPassportBook({ locale, option }: { locale: AppLocale; option: SelectedBiasOption }) {
  const book = usePassportBook(option.passportId);
  const title = dukjilText(locale, "missionBookTitle"), detail = myHomeText(locale, "viewDetails");
  const href = `/passports/${encodeURIComponent(option.passportId)}?locale=${locale}#mission-book`;
  const celebrity = { slug: option.slug, name: option.name, image: option.image, ...(option.imagePosition ? { imagePosition: option.imagePosition } : {}), ...(option.photos ? { photos: option.photos } : {}) };
  const tierName = option.stage ? fanStageLabel(locale, option.stage) : levelLabel(locale, option.tier);
  if (book.status === "off") return null;
  return <section className={`${myStyles.card} ${styles.host}`} aria-label={title} data-stan-passport-book="">
    <header><FanHeading as="h3">{title}</FanHeading><FanSectionLink href={href}>{detail}</FanSectionLink></header>
    <PassportBookBody passportId={option.passportId} celebrity={celebrity} tier={option.tier} stageKey={option.stage?.key ?? null} tierName={tierName} tierStep={null} book={book} href={href} bookLabel={`${option.name} · ${detail}`} locale={locale}
      error={book.status === "error" ? { message: dukjilText(locale, "missionLoadError"), retryLabel: dukjilText(locale, "missionRetry"), onRetry: book.retry } : null} />
  </section>;
}
