"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import styles from "./result.module.css";

/** 친구가 자랑한 사주 카드. 줄이 없거나 지워졌으면 빈 상태로 케미 탭 길만 남긴다. */
export function SajuShared({ locale, from }: { locale: AppLocale; from: string }) {
  const [state, setState] = useState<{ line: string } | "empty" | "loading" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/chemi/shares/${encodeURIComponent(from)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const card = await response.json();
        if (controller.signal.aborted) return;
        setState(card.gone || !card.line ? "empty" : { line: card.line });
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    })();
    return () => controller.abort();
  }, [from]);
  const home = `/chemi?locale=${locale}`;
  if (state === "loading")
    return (
      <section className={styles.layout} aria-busy="true">
        <FanSkeleton width="40%" />
        <FanSkeleton shape="block" className={styles.loadingHero} />
      </section>
    );
  if (state === "empty" || state === "error")
    return (
      <FanState
        kind="empty"
        title="볼 수 있는 사주 카드가 없습니다"
        action={{ href: home, label: "케미로 가기" }}
      />
    );
  return (
    <section className={styles.layout}>
      <div className={styles.panel}>
        <FanHeading as="h1">최애 사주</FanHeading>
        <FanState inline kind="info" title={state.line} />
        <FanAction variant="neutral" href={home}>
          케미로 가기
        </FanAction>
      </div>
    </section>
  );
}
