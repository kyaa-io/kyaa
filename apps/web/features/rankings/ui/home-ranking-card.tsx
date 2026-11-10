"use client";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { RankingBoard } from "./ranking-board";
import { rankingsText } from "./rankings-copy";
import styles from "./home-ranking-card.module.css";

/** 홈의 오늘의 랭킹: 제목과 기간 선택 아래에 랭킹 본문(`RankingBoard`)을 그대로 놓는다. 따로 펼치는 전체 화면은 없다. */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  return <section className={styles.card} aria-labelledby={headingId} data-home-ranking>
    <RankingBoard locale={locale} scope={headingId} heading={<FanHeading id={headingId}>{rankingsText(locale, "rkHomeTitle")}</FanHeading>} />
  </section>;
}
