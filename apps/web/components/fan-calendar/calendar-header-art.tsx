"use client";

import type { PhotoSet } from "@/features/media/domain/public-image";
import { useEffect, useState } from "react";
import Image from "next/image";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import { creatorCalendarPhotos, hasCreatorCalendarPhotos } from "@/components/fan-ui/creator-image-config";
import styles from "./calendar-header-art.module.css";

const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export type CalendarArtCreator = { slug: string; name: string; image: string; photos?: PhotoSet; imagePosition?: string };

/** 달력 머리 가운데의 월 그림(`11 November`). 장식이므로 읽는 글은 호출한 쪽이 따로 둔다. */
export function CalendarMonthArt({ month }: { month: string }) {
  const monthName = months[Number(month.slice(5, 7)) - 1];
  return <span className={styles.month} aria-hidden="true" data-calendar-month-art>
    <span className={styles.number}>{month.slice(5, 7)}</span>
    {monthName ? <Image className={styles.letter} src={`/images/calendar/lettering/${monthName}.svg`} alt="" width={400} height={130} /> : null}
  </span>;
}

/** 달력 머리 오른쪽의 사진 묶음. 고른 크리에이터가 바뀌면 잠깐 내려앉았다가 새 사진으로 바뀐다. */
export function CalendarPhotoStack({ celebrity }: { celebrity?: CalendarArtCreator }) {
  const [shown, setShown] = useState(celebrity);
  const changing = shown?.slug !== celebrity?.slug;
  useEffect(() => {
    if (!changing) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setShown(celebrity), reduced ? 0 : 130);
    return () => window.clearTimeout(timer);
  }, [celebrity, changing]);
  const photos = shown ? creatorCalendarPhotos(shown.slug, shown.image, shown.photos).slice(0, 3) : [];
  return <div className={styles.stack} aria-hidden="true" data-calendar-art data-calendar-art-mode={shown?.slug ?? "byus"} data-leaving={changing ? "true" : undefined}>
    {shown ? <div className={styles.collage} data-count={photos.length}>
      {photos.map((src) => <div className={styles.card} key={src}>
        <span className={styles.frame} />
        <Image className={styles.tape} src="/images/calendar/tape-pink.svg" alt="" width={90} height={28} />
        <div className={styles.photo} data-group={shown.slug === "xin" || !hasCreatorCalendarPhotos(shown.slug) ? "true" : undefined}>
          <CreatorImage slug={shown.slug} src={src} photos={shown.photos} position={shown.imagePosition} alt="" fill sizes="120px" presentation="calendar" />
        </div>
        <span className={styles.name}>{shown.name}</span>
        <Image className={styles.cardStar} src="/images/calendar/star-spark.svg" alt="" width={16} height={16} />
      </div>)}
    </div> : <Image className={styles.brand} src="/images/calendar/lettering/kyaa.svg" alt="" width={360} height={174} />}
    <Image className={styles.star} src="/images/calendar/star-handwritten.svg" alt="" width={40} height={40} />
  </div>;
}
