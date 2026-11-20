"use client";

import { useState } from "react";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { HomeBanner } from "./home-banner";
import { GameRankings, type GameRanking } from "./game-rankings";
import { entries } from "./contents";
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
  if (preview && growth)
    return (
      <div className={styles.row}>
        <b>{copy.raise}</b>
        <small>{copy.ready}</small>
      </div>
    );
  return (
    <div className={styles.home} data-ranked={preview && Boolean(rankings.length)}>
      <HomeBanner copy={copy} locale={locale} />
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
          {entries
            .filter(([id, type]) => (preview || type === "readings" || (id === "pair" && matchAvailable)) && (category === "all" || category === type))
            .map(([id, , readingPath]) => {
              const path = id === "pair" && matchAvailable ? "/chemi/games/match" : readingPath;
              const content = (
                <>
                  <img src={`/chemi/thumb-${id}-128.webp`} alt="" />
                  <b>{copy[id]}</b>
                </>
              );
              return path ? (
                <Link
                  key={id}
                  className={styles.row}
                  href={`${path}?locale=${locale}`}
                >
                  {content}
                </Link>
              ) : (
                <div key={id} className={styles.row}>
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
