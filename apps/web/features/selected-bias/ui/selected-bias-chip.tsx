"use client";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Star, Thermometer } from "lucide-react";
import { useEffect } from "react";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { GROUP_WALLET_CHANGED_EVENT } from "@/features/groups/ui/use-group-resource";
import { temperatureParts, temperatureValue } from "@/features/temperature/temperature";
import type { Route } from "next";
import Link from "next/link";
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

const Empty = ({ locale }: { locale: AppLocale }) => <><Star size={20} aria-hidden="true" className={styles.star} /><span className={styles.name}>{text(locale, "biasChoose")}</span></>;

/** The header's tier and selected favorite. Signed out it stays in place as the way in; pressing it changes the favorite everywhere the hook is read. */
export function SelectedBiasChip({ locale }: { locale: AppLocale }) {
  const bias = useSelectedBias(locale);
  const pathname = usePathname() || "/", query = useSearchParams()?.toString();
  if (bias.status === "loading") return <span className={styles.chip} data-selected-bias="loading" aria-hidden="true"><span className={styles.placeholder} /></span>;
  if (bias.status === "guest") return <Link className={styles.chip} data-selected-bias="guest" href={fanLoginHref(locale, `${pathname}${query ? `?${query}` : ""}`)}><Empty locale={locale} /></Link>;
  if (bias.unverified) return <Link className={styles.chip} data-selected-bias="unverified" href={`/${encodeURIComponent(bias.unverified.slug)}?locale=${locale}` as Route}><Star size={20} aria-hidden="true" className={styles.star} /><span className={styles.name}>{bias.unverified.name}</span></Link>;
  if (bias.status === "empty") return <Link className={styles.chip} data-selected-bias="empty" href={`/pages/groups?locale=${locale}` as Route}><Empty locale={locale} /></Link>;
  if (bias.status === "error") return <FanAction variant="text" className={styles.chip} data-selected-bias="error" onClick={bias.retry}><Empty locale={locale} /></FanAction>;
  const current = bias.selected!;
  // One catalog read and one `today` read for the selected favorite; the temperature comes from them (D2).
  return <DukjilProvider slug={current.slug} locale={locale}><SelectedChip locale={locale} bias={bias} current={current} /></DukjilProvider>;
}

/** The header state's three cells (261107-2 N17): tier · favorite · temperature°. Without a favorite it asks to choose and draws no temperature;
 * without today's daily missions (total 0 or unknown) there is no temperature cell. The temperature pulses once when it changes. */
export function SelectedBiasStatus({ locale, grade, favorite, tier, stageKey, completedMissions, totalMissions }: {
  locale: AppLocale; grade: string; favorite: string | null; tier?: SelectedBiasOption["tier"]; stageKey?: FanStageKey;
  completedMissions?: number; totalMissions?: number;
}) {
  if (!favorite) return <Empty locale={locale} />;
  const temperature = totalMissions ? temperatureValue(completedMissions ?? 0, totalMissions) : null;
  return <>
    {tier ? <FanTierBadge tier={tier} stageKey={stageKey} locale={locale} size={24} className={styles.badge} /> : null}
    <span className={styles.grade}>{grade}</span>
    <span className={styles.name}>{favorite}</span>
    {temperature !== null ? <span className={styles.temp} data-temperature={temperature}><FanNumber value={temperature} unit="°" locale={locale} pulseOnChange className={styles.tempValue} /></span> : null}
  </>;
}

/** Header state (261107-2 U2, D2): tier · favorite · temperature°. The tier word shows from 1200px; below that the tier stamp alone stands for it. No temperature without a daily mission. */
function SelectedChip({ locale, bias, current }: { locale: AppLocale; bias: SelectedBias; current: SelectedBiasOption }) {
  const dukjil = useDukjil();
  const refresh = dukjil?.refresh;
  // A mission paid on another screen moves the wallet; read today's count again so the temperature follows.
  useEffect(() => {
    if (!refresh) return;
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, refresh);
  }, [refresh]);
  const temp = dukjil?.status === "on" ? temperatureParts(dukjil.catalog, dukjil.today, dukjil.attendance?.attendedToday) : null;
  const grade = gradeOf(locale, current);
  const temperature = temp?.total ? temperatureValue(temp.done, temp.total) : null;
  // F10: each cell has its own destination — the tier opens the 찐팬 tier guide, the favorite opens the switch menu, the temperature opens today's missions.
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
    <Menu.Portal>
      <Menu.Positioner className={styles.positioner} sideOffset={8} align="end">
        <Menu.Popup className={styles.menu}>
          {temp ? <Menu.Item className={styles.tempRow} render={<Link href={`/benefits?locale=${locale}` as Route} />}>
            <Thermometer size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.itemText}><strong>{text(locale, "tempTitle")} {temp.value.toLocaleString(locale)}°</strong><small>{text(locale, "tempMissions", [temp.done, temp.total])}</small></span>
          </Menu.Item> : null}
          <p className={styles.title}>{text(locale, "biasMine")}</p>
          <Menu.RadioGroup value={current.slug} onValueChange={(slug: string) => bias.select(slug)}>
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
    </Menu.Root>
    {temperature !== null ? <Link className={`${styles.cell} ${styles.temp}`} data-cell="temperature" data-temperature={temperature} href={`/benefits?locale=${locale}` as Route} aria-label={`${text(locale, "tempTitle")} ${temperature.toLocaleString(locale)}°`}><FanNumber value={temperature} unit="°" locale={locale} pulseOnChange className={styles.tempValue} /></Link> : null}
  </span>;
}
