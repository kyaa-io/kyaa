"use client";

import { FanAction } from "@/components/fan-ui/fan-action";
import { fortunePath } from "./contents";
import type { HomeCopy } from "./home";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import styles from "./home.module.css";

export function HomeBanner({
  locale,
  copy,
}: {
  locale: string;
  copy: HomeCopy;
}) {
  return (
    <section className={styles.banner}>
      <picture>
        <source media="(min-width: 48rem)" srcSet="/chemi/fortune-wide-1456.webp" />
        <img src="/chemi/fortune.png" alt="" />
      </picture>
      <div className={styles.caption}>
        <div>
          <small>{copy.creator}</small>
          <FanHeading as="h1">{copy.fortune}</FanHeading>
        </div>
        <FanAction variant="primary" href={`${fortunePath}?locale=${locale}`}>
          {copy.start}
        </FanAction>
      </div>
    </section>
  );
}
