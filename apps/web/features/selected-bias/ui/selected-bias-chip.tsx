"use client";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Heart, Star } from "lucide-react";
import type { ReactNode } from "react";
import { FanNumber } from "@/components/fan-ui/fan-number";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { usePathname, useSearchParams } from "next/navigation";
import { FanAction } from "@/components/fan-ui/fan-action";
import { fanLoginHref } from "@/components/login-href";

import { fanStageLabel, fanTierEntryKey, type FanStageKey } from "@/features/rewards/domain/fan-stage";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { messages } from "@/i18n/catalogs/features__selected-bias";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { selectedBiasSource } from "./selected-bias-source";
import { useSelectedBias, type SelectedBias, type SelectedBiasOption } from "./use-selected-bias";
import styles from "./selected-bias-chip.module.css";

function text(locale: AppLocale, key: keyof typeof selectedBiasSource, values: readonly unknown[] = []) {
  const source = selectedBiasSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}

function gradeOf(locale: AppLocale, option: SelectedBiasOption) {
  const key = option.stage?.key ?? fanTierEntryKey(option.tier);
  return fanStageLabel(locale, { tier: option.tier, subdivision: option.stage?.subdivision ?? Number(key.split("-").at(-1)) });
}

const Empty = ({ locale }: { locale: AppLocale }) => <><img src="/images/groups/join-community-20261112.webp" alt="" width={40} height={40} /><span className={styles.pickLabel}>{text(locale, "biasChoose")}</span></>;

/** The header's tier and selected favorite. Signed out it stays in place as the way in; pressing it changes the favorite everywhere the hook is read. */
export function SelectedBiasChip({ locale }: { locale: AppLocale }) {
  const bias = useSelectedBias(locale);
  if (bias.status === "loading") return <span className={styles.chip} data-selected-bias="loading" aria-hidden="true"><span className={styles.placeholder} /></span>;
  if (bias.unverified) return <Link className={styles.chip} data-selected-bias="unverified" href={`/${encodeURIComponent(bias.unverified.slug)}?locale=${locale}` as Route}><Star size={20} aria-hidden="true" className={styles.star} /><span className={styles.name}>{bias.unverified.name}</span></Link>;
  if (bias.status === "empty" || bias.status === "guest" || bias.status === "error") return <Link className={styles.chip} data-selected-bias="empty" aria-label={text(locale, "biasChoose")} href={`/pages/groups?locale=${locale}` as Route}><Empty locale={locale} /></Link>;
  // No named favorite: use community discovery even when passports already exist.
  if (!bias.selected) return <Link className={styles.chip} data-selected-bias="unnamed" href={`/pages/groups?locale=${locale}` as Route}><Empty locale={locale} /></Link>;
  return <SelectedChip locale={locale} bias={bias} current={bias.selected} />;
}

/** The header's hearts: a heart and the count beside it (not inside: 1,234 does not fit a 16px heart). Number and heart pulse once together when
 * the count changes (FanNumber's data-pulse; none on first draw or with reduced motion). */
function HeartsValue({ locale, hearts }: { locale: AppLocale; hearts: number }) {
  return <FanNumber value={hearts} locale={locale} pulseOnChange className={styles.heartsValue} icon={<Heart size={16} strokeWidth={1.75} className={styles.heart} />} />;
}

/** The favorite's 팬·랭킹 tab, where hearts are counted per fan. */
const fansHref = (slug: string, locale: AppLocale) => `/${encodeURIComponent(slug)}?tab=fans&locale=${locale}` as Route;

/** The header state's three cells (feedback C1): tier · favorite · ♥hearts. Hearts are the ones collected in the selected favorite's community;
 * without a favorite it asks to choose and draws no hearts. A missing count reads as 0. */
export function SelectedBiasStatus({ locale, grade, favorite, tier, stageKey, hearts }: {
  locale: AppLocale; grade: string; favorite: string | null; tier?: SelectedBiasOption["tier"]; stageKey?: FanStageKey; hearts?: number | null;
}) {
  if (!favorite) return <Empty locale={locale} />;
  const value = hearts ?? 0;
  return <>
    {tier ? <FanTierBadge tier={tier} stageKey={stageKey} locale={locale} size={24} className={styles.badge} /> : null}
    <span className={styles.grade}>{grade}</span>
    <span className={styles.name}>{favorite}</span>
    <span className={styles.hearts} data-hearts={value} aria-label={text(locale, "heartsLabel", [value.toLocaleString(locale), favorite])}><HeartsValue locale={locale} hearts={value} /></span>
  </>;
}

/** Header state (feedback C1): tier · favorite · ♥hearts. The tier word shows from 1200px; below that the tier stamp alone stands for it.
 * Hearts come with the summary (`hearts=1`); when the server gave none (its hearts read failed) the cell is left out rather than showing a guess. 0 is shown as 0. */
function SelectedChip({ locale, bias, current }: { locale: AppLocale; bias: SelectedBias; current: SelectedBiasOption }) {
  const hearts = current.hearts;
  const grade = gradeOf(locale, current);
  // F10: each cell has its own destination — the tier opens the 찐팬 tier guide, the favorite opens the switch menu, the hearts open the favorite's 팬·랭킹 tab.
  return <span className={styles.group} data-selected-bias="selected">
    <Link className={styles.cell} data-cell="tier" href={`/guide/jjinfan?locale=${locale}` as Route} aria-label={grade}>
      {current.tier ? <FanTierBadge tier={current.tier} stageKey={current.stage?.key} locale={locale} size={24} className={styles.badge} /> : null}
      <span className={styles.grade} aria-hidden="true">{grade}</span>
    </Link>
    <Menu.Root>
    <Menu.Trigger className={`${styles.chip} ${styles.trigger}`} data-cell="favorite" aria-label={text(locale, "biasCurrent", [current.name, grade])}>
      <span className={styles.name}>{current.name}</span>
      <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
    </Menu.Trigger>
    <FavoriteMenu locale={locale} bias={bias} current={current} />
    </Menu.Root>
    {hearts !== undefined ? <Link className={`${styles.cell} ${styles.hearts}`} data-cell="hearts" data-hearts={hearts} href={fansHref(current.slug, locale)} aria-label={text(locale, "heartsLabel", [hearts.toLocaleString(locale), current.name])}><HeartsValue locale={locale} hearts={hearts} /></Link> : null}
  </span>;
}

/** The favorite switch menu, shared by the header chip and the 덕질 status bar: hearts first (to the fans tab), then every passport, then more. */
function FavoriteMenu({ locale, bias, current }: { locale: AppLocale; bias: SelectedBias; current: SelectedBiasOption | null }) {
  const hearts = current?.hearts;
  return <>
    <Menu.Portal>
      <Menu.Positioner className={styles.positioner} sideOffset={8} align="end">
        <Menu.Popup className={styles.menu}>
          {current && hearts !== undefined ? <Menu.Item className={styles.heartsRow} render={<Link href={fansHref(current.slug, locale)} />}>
            <Heart size={20} strokeWidth={1.75} aria-hidden="true" className={styles.heart} />
            <span className={styles.itemText}><strong>{hearts.toLocaleString(locale)}</strong><small>{text(locale, "heartsMenu", [current.name])}</small></span>
          </Menu.Item> : null}
          <p className={styles.title}>{text(locale, current ? "biasMine" : "biasPickTitle")}</p>
          <Menu.RadioGroup value={current?.slug ?? null} onValueChange={(slug: string) => bias.select(slug)}>
            {bias.options.map((option) => <Menu.RadioItem key={option.slug} value={option.slug} className={styles.item}>
              <FanTierBadge tier={option.tier} stageKey={option.stage?.key} locale={locale} size={32} />
              <span className={styles.itemText}><strong>{option.name}</strong><small>{gradeOf(locale, option)}</small></span>
              <Menu.RadioItemIndicator className={styles.check}><Check size={18} aria-hidden="true" /></Menu.RadioItemIndicator>
            </Menu.RadioItem>)}
          </Menu.RadioGroup>
          <Menu.Item className={styles.more} render={<Link href={`/pages/groups?locale=${locale}` as Route} />}>{text(locale, "biasFindMore")}</Menu.Item>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </>;
}

/** 덕질 status bar (feedback C1·C9, 390 and 1440): one row, the same three values as the header. Left: tier · favorite, which opens the
 * favorite menu; right: ♥N, which opens the favorite's fans tab. Signed out: choose-favorite (to sign in) and a locked hearts value.
 * `bias` is passed in so the screen can draw the server-read favorite in the first HTML. */
export function SelectedBiasBar({ locale, bias }: { locale: AppLocale; bias: SelectedBias; loginHref: string }) {
  if (bias.status === "loading") return <div className={styles.bar} data-selected-bias-bar="loading" aria-hidden="true"><span className={styles.placeholder} /></div>;
  const current = bias.selected;
  if (!current) {
    const target = bias.unverified;
    return <div className={styles.bar} data-selected-bias-bar="empty"><Link className={styles.chip} href={(target ? `/${encodeURIComponent(target.slug)}?locale=${locale}` : `/pages/groups?locale=${locale}`) as Route}>{target ? <><Star size={20} aria-hidden="true" className={styles.star} /><span className={styles.name}>{target.name}</span></> : <Empty locale={locale} />}</Link></div>;
  }
  const grade = gradeOf(locale, current), hearts = current.hearts;
  return <div className={styles.bar} data-selected-bias-bar="selected">
    <Menu.Root>
      <Menu.Trigger className={`${styles.chip} ${styles.barTrigger}`} aria-label={text(locale, "biasCurrent", [current.name, grade])}>
        {current.tier ? <FanTierBadge tier={current.tier} stageKey={current.stage?.key} locale={locale} size={24} className={styles.badge} /> : null}
        <span className={styles.barGrade}>{grade}</span>
        <span className={styles.name}>{current.name}</span>
        <ChevronDown size={16} aria-hidden="true" className={styles.barChevron} />
      </Menu.Trigger>
      <FavoriteMenu locale={locale} bias={bias} current={current} />
    </Menu.Root>
    {hearts !== undefined ? <Link className={styles.barHearts} data-hearts={hearts} href={fansHref(current.slug, locale)} aria-label={text(locale, "heartsLabel", [hearts.toLocaleString(locale), current.name])}>
      <FanNumber value={hearts} size="lg" locale={locale} pulseOnChange className={styles.heartsValue} icon={<Heart size={20} strokeWidth={1.75} className={styles.heart} />} />
    </Link> : null}
  </div>;
}


/** Existing favorites keep their switch menu; empty states lead to community discovery. */
export function FavoritePickMenu({ locale, bias, className, children }: { locale: AppLocale; bias: SelectedBias; className?: string; children: ReactNode }) {
  if (!bias.selected && !bias.unverified) return <Link className={className} href={`/pages/groups?locale=${locale}` as Route} data-favorite-pick="">{children}</Link>;
  return <Menu.Root>
    <Menu.Trigger className={className} data-favorite-pick="">{children}</Menu.Trigger>
    <FavoriteMenu locale={locale} bias={bias} current={null} />
  </Menu.Root>;
}
