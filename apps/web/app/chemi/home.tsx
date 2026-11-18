"use client";

import { useState } from "react";
import Link from "next/link";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { HomeBanner } from "./home-banner";
import { GameRankings, type GameRanking } from "./game-rankings";
import styles from "./home.module.css";

export type HomeCopy =
  typeof import("@/features/chemi/i18n/locales/ko/chemi.json").home;

const entries = [
  ["saju", "readings"],
  ["fortune", "readings"],
  ["zodiac", "readings"],
  ["tarot", "readings"],
  ["pair", "games"],
  ["run", "games"],
] as const;

export function ChemiHome({
  copy,
  locale,
  growth,
  rankings = [],
}: {
  copy: HomeCopy;
  locale: string;
  growth: boolean;
  rankings?: readonly GameRanking[];
}) {
  const [category, setCategory] = useState("all");
  if (growth)
    return (
      <div className={styles.row}>
        <b>{copy.raise}</b>
        <small>{copy.ready}</small>
      </div>
    );
  return (
    <div className={styles.home} data-ranked={Boolean(rankings.length)}>
      <HomeBanner copy={copy} locale={locale} />
      {rankings.length > 0 && <GameRankings games={rankings} />}
      <section>
        <FanTabs
          variant="chip"
          label={copy.filter}
          current={category}
          items={(["all", "readings", "games"] as const).map((key) => ({
            key,
            label: copy[key],
            onSelect: () => setCategory(key),
          }))}
        />
        <div className={styles.list}>
          {entries
            .filter(([, type]) => category === "all" || category === type)
            .map(([id]) => {
              const content = (
                <>
                  <img src={`/chemi/thumb-${id}.png`} alt="" />
                  <b>{copy[id]}</b>
                </>
              );
              return id === "fortune" ? (
                <Link
                  key={id}
                  className={styles.row}
                  href={`/chemi/fortune?locale=${locale}`}
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
