"use client";

import { useState } from "react";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { HomeBanner } from "./home-banner";
import { GameRankings, type GameRanking } from "./game-rankings";
import { entries } from "./contents";
import { ChemiGrowth } from "./growth/growth";
import styles from "./home.module.css";

export type HomeCopy =
  typeof import("@/features/chemi/i18n/locales/ko/chemi.json").home;

export function ChemiHome({
  copy,
  locale,
  growth,
  preview,
  rankings = [],
  matchAvailable = false,
}: {
  copy: HomeCopy;
  locale: string;
  growth: boolean;
  preview: boolean;
  matchAvailable?: boolean;
  rankings?: readonly GameRanking[];
}) {
  const [category, setCategory] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const activities = entries.map(([id, type, path]) => ({
    id,
    type,
    href: type === "readings" || matchAvailable ? `${path}?locale=${locale}` : null,
  }));
  if (preview && growth)
    return <ChemiGrowth locale={locale} home={copy} matchAvailable={matchAvailable} />;
  return (
    <div className={styles.home} data-ranked={preview && Boolean(rankings.length)}>
      <HomeBanner copy={copy} activities={activities} index={activeIndex} setIndex={setActiveIndex} />
      {preview && rankings.length > 0 && <GameRankings label={copy.rankings} games={rankings} />}
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
              const content = (
                <>
                  <img src={`/chemi/thumb-${id}-128-v2.webp`} alt="" />
                  <b>{copy[id]}</b>
                </>
              );
              return href ? (
                <Link
                  key={id}
                  className={styles.row}
                  data-selected={active}
                  href={href}
                >
                  {content}
                </Link>
              ) : (
                <div key={id} className={styles.row} data-selected={active}>
                  {content}
                  <small>{copy.ready}</small>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
