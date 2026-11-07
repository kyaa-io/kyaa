"use client";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Star } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { fanLoginHref } from "@/components/login-href";
import { fanStageLabel, fanTierEntryKey } from "@/features/rewards/domain/fan-stage";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { messages } from "@/i18n/catalogs/features__selected-bias";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { selectedBiasSource } from "./selected-bias-source";
import { useSelectedBias, type SelectedBiasOption } from "./use-selected-bias";
import styles from "./selected-bias-chip.module.css";

function text(locale: AppLocale, key: keyof typeof selectedBiasSource, values: readonly unknown[] = []) {
  const source = selectedBiasSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}

function gradeOf(locale: AppLocale, option: SelectedBiasOption) {
  const key = option.stage?.key ?? fanTierEntryKey(option.tier);
  return fanStageLabel(locale, { tier: option.tier, subdivision: option.stage?.subdivision ?? Number(key.split("-").at(-1)) });
}

const Empty = ({ locale }: { locale: AppLocale }) => <><Star size={20} aria-hidden="true" className={styles.star} /><span className={styles.name}>{text(locale, "biasChoose")}</span></>;

/** The header's tier and selected favorite. Signed out it stays in place as the way in; pressing it changes the favorite everywhere the hook is read. */
export function SelectedBiasChip({ locale }: { locale: AppLocale }) {
  const bias = useSelectedBias(locale);
  const pathname = usePathname() || "/", query = useSearchParams()?.toString();
  if (bias.status === "loading") return <span className={styles.chip} data-selected-bias="loading" aria-hidden="true"><span className={styles.placeholder} /></span>;
  if (bias.status === "guest") return <Link className={styles.chip} data-selected-bias="guest" href={fanLoginHref(locale, `${pathname}${query ? `?${query}` : ""}`)}><Empty locale={locale} /></Link>;
  if (bias.status === "empty") return <Link className={styles.chip} data-selected-bias="empty" href={`/pages/groups?locale=${locale}` as Route}><Empty locale={locale} /></Link>;
  if (bias.status === "error") return <button className={styles.chip} data-selected-bias="error" type="button" onClick={bias.retry}><Empty locale={locale} /></button>;
  const current = bias.selected;
  return <Menu.Root>
    <Menu.Trigger className={styles.chip} data-selected-bias={current ? "selected" : "choose"} aria-label={current ? text(locale, "biasCurrent", [current.name, gradeOf(locale, current)]) : text(locale, "biasChoose")}>
      {current ? <>
        <FanTierBadge tier={current.tier} stageKey={current.stage?.key} locale={locale} size={24} className={styles.badge} />
        <span className={styles.name}>{current.name}</span>
        <span className={styles.grade}>{gradeOf(locale, current)}</span>
      </> : <Empty locale={locale} />}
      <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner className={styles.positioner} sideOffset={8} align="end">
        <Menu.Popup className={styles.menu}>
          <p className={styles.title}>{text(locale, "biasMine")}</p>
          <Menu.RadioGroup value={current?.slug ?? ""} onValueChange={(slug: string) => bias.select(slug)}>
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
  </Menu.Root>;
}
