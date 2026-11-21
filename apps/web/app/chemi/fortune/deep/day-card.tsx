"use client";

import { useEffect, useState } from "react";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { renderCardImage } from "../card/card-image";
import { fortuneCharacters, type FortuneCharacterId } from "../lines";
import { kstWeekday } from "../result-copy";
import { AMULET_PAPER, deepArt, dotted, gradeKey, voiced } from "./copy";
import styles from "./deep.module.css";

type Props = {
  kind: "keepsake" | "amulet";
  character: FortuneCharacterId;
  day: string;
  score: number;
  locale: string;
};

/** 입구·목록의 작은 그림(글 없음). 기념 카드는 그림, 응원 부적은 부적 종이 위 둥근 창. */
export function DayCardThumb({ kind, character }: Pick<Props, "kind" | "character">) {
  return kind === "keepsake" ? (
    <span className={styles.thumb} aria-hidden="true">
      <img src={deepArt("keep", character)} alt="" />
    </span>
  ) : (
    <span className={`${styles.thumb} ${styles.thumbAmulet}`} aria-hidden="true">
      <img src={AMULET_PAPER} alt="" />
      <img src={deepArt("care", character)} alt="" />
    </span>
  );
}

/**
 * 날에 따라 하나만 나오는 카드. 아주 좋은 날 = 기념 카드, 쉬어 가는 날 = 응원 부적(손글씨).
 * 화면에 보이는 카드와 저장되는 그림이 같도록, 저장용 그림(1024×1536)을 그대로 보여 준다.
 */
export function DayCard({ kind, character, day, score, locale }: Props) {
  const text = useReadingCopy();
  const name = fortuneCharacters.find((item) => item.id === character)?.name ?? "";
  const date = `${dotted(day)} ${kstWeekday(locale, Date.parse(`${day}T12:00:00+09:00`))}`;
  const grade = text(gradeKey(score));
  const hand = text(voiced("amuletHand", character));
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void renderCardImage({ kind, character, name, date, score, grade, hand })
      .then((file) => {
        if (!live) return;
        url = URL.createObjectURL(file);
        setImage(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [kind, character, name, date, score, grade, hand]);
  const label =
    kind === "keepsake" ? text("keepsakeAlt", { name, date, score }) : `${text("amuletAlt", { name, date })} ${hand.replace("\n", " ")}`;
  // 그림을 만들지 못하는 기기에서는 카드 원화만 보여 준다(저장도 같은 이유로 실패를 알린다).
  if (failed) return <img className={styles.cardImage} src={deepArt(kind === "keepsake" ? "keep" : "care", character)} alt={label} />;
  if (!image) return <FanSkeleton shape="block" className={styles.cardImage} />;
  return <img className={styles.cardImage} src={image} alt={label} />;
}
