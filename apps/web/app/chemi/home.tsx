"use client";

import { useState } from "react";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { useTodayReadings } from "./use-today-readings";
import { GameStatusChip } from "./game-status-chip";
import { HomeBanner } from "./home-banner";
import { WeeklyRankings } from "./weekly-rankings";
import { AffinityBadge } from "@/features/chemi/ui/affinity-badge";
import { getGrowthCopy } from "./growth/copy";
import { EARN, entries } from "./contents";
import { ChemiGrowth } from "./growth/growth";
import styles from "./home.module.css";

export type HomeCopy =
  typeof import("@/features/chemi/i18n/locales/ko/chemi.json").home;

export function ChemiHome({
  copy,
  locale,
  growth,
  preview,
  matchAvailable = false,
}: {
  copy: HomeCopy;
  locale: string;
  growth: boolean;
  preview: boolean;
  matchAvailable?: boolean;
}) {
  const [category, setCategory] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const readings = useTodayReadings();
  const activities = entries.map(([id, type, path]) => ({
    id,
    type,
    href: type === "readings" || matchAvailable ? `${path}?locale=${locale}` : null,
  }));
  if (preview && growth)
    return <ChemiGrowth locale={locale} home={copy} matchAvailable={matchAvailable} />;
  return (
    <div className={styles.home} data-ranked={preview} data-chemi-hide-dm="">
      <HomeBanner copy={copy} activities={activities} index={activeIndex} setIndex={setActiveIndex} />
      {preview && <WeeklyRankings copy={copy} locale={locale} matchAvailable={matchAvailable} />}
      <section>
        {preview && <FanTabs
          variant="chip"
          label={copy.filter}
          current={category}
          items={(["all", "readings", "games"] as const).map((key) => ({
            key,
            label: copy[key],
            onSelect: () => setCategory(key),
          }))}
        />}
        <div className={styles.list}>
          {activities
            .filter(({ type, href }) => (preview || href) && (category === "all" || category === type))
            .map(({ id, href }) => {
              const active = activities[activeIndex].id === id;
              const saved = readings?.find(row => row.content === EARN[id][0] && row.kind === (id === "saju" ? "first" : "daily"));
              const destination = saved && href ? href + "&" + new URLSearchParams({ c: saved.character, step: "result", r: saved.readingId }) : href;
              const content = (
                <>
                  <img src={`/chemi/thumb-${id}-128-v2.webp`} alt="" />
                  <span id={`chemi-copy-${id}`} className={styles.rowCopy}>
                    <span className={styles.rowTitle}>
                      <FanText role="item">{copy[id]}</FanText>
                      {href && <AffinityBadge size="sm" amount={EARN[id][1]} label={getGrowthCopy(locale).gain.replace("{n}", String(EARN[id][1]))} />}
                    </span>
                    <FanText role="meta">{copy.descriptions[id]}</FanText>
                    {saved && <FanText role="label" className={styles.statusChip}>{copy.todayResult}</FanText>}
                    {href && (id === "pair" || id === "run") && <GameStatusChip game={id} copy={copy} />}
                  </span>
                </>
              );
              return destination ? (
                <Link
                  key={id}
                  aria-label={copy[id]}
                  aria-describedby={`chemi-copy-${id}`}
                  className={styles.row}
                  data-selected={active}
                  href={destination}
                >
                  {content}
                </Link>
              ) : (
                <div key={id} className={styles.row} data-selected={active}>
                  {content}
                  <FanText role="label">{copy.ready}</FanText>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
