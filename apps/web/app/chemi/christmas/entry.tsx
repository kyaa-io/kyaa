"use client";

import { SaveResultImage } from "@/features/chemi/ui/result/save-result-image";
import type { computeChristmasReading } from "@/server/chemi-engine/christmas";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanState } from "@/components/fan-ui/fan-state";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { BirthSheet, type BirthInput } from "../fortune/birth-sheet";
import { saveBirth } from "../fortune/reading";
import styles from "../fortune/scene.module.css";

type Catalog = typeof import("@/features/chemi/i18n/locales/ko/chemi.json");
export function ChristmasEntry({ catalog, locale }: { catalog: Catalog; locale: string }) {
  const { getAccessToken, login } = useByUsAuth();
  const [state, setState] = useState<"entry" | "empty" | "error" | "result">("entry");
  const [busy, setBusy] = useState(false);
  const [birthOpen, setBirthOpen] = useState(false);
  const [reading, setReading] = useState<Extract<ReturnType<typeof computeChristmasReading>, { locked: false }> | null>(null);
  const { grades, lines } = catalog.christmas;
  const formatDay = (day: string) => new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(day));
  const detail = reading ? [reading.topPercent <= 50 && catalog.christmas.rank.replace("{n}", String(reading.topPercent)), lines[reading.grade], reading.opportunityDates.length > 0 && `${catalog.christmas.dates} · ${reading.opportunityDates.map(formatDay).join(" · ")}`].filter(Boolean).join("\n") : "";

  async function read(birth?: BirthInput) {
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (birth) await saveBirth(token, birth);
      const response = await fetch("/api/chemi/christmas", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.status === 401) { login(); return; }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.birthRequired) setState("empty");
      else if (typeof result.score === "number") {
        setReading(result);
        setState("result");
      } else throw new Error();
    } catch { setState("error"); }
    finally { setBusy(false); setBirthOpen(false); }
  }

  return <div className={styles.page}>
    <div className={styles.stage}>
      <picture className={styles.art}>
        <source media="(min-width: 768px)" srcSet="/chemi/christmas/pc-5x2.webp" />
        <img src="/chemi/christmas/mobile-9x4.webp" alt="" />
      </picture>
      <div className={styles.controls}>
        <FanHeading as="h1">{catalog.home.christmas}</FanHeading>
        {state === "entry" && <p>{catalog.home.saju} · {catalog.home.zodiac} · {formatDay("2026-12-24")} / {formatDay("2026-12-25")}</p>}
        {state === "empty" && <FanState kind="empty" title={catalog.christmas.birth} />}
        {state === "error" && <FanState inline kind="error" title={catalog.readingUi.fortuneFailure} />}
        {state === "result" && reading && <>
          <FanHeading>{grades[reading.grade]} · {reading.score}%</FanHeading>
          {detail.split("\n").map(line => <p key={line}>{line}</p>)}
          <p>{reading.fortuneDate} · {catalog.home.saju} · {catalog.readingUi.love} {reading.fortune.fields.love}</p>
          <p>{reading.star.date} · {catalog.home.zodiac} · {catalog.readingUi.love} {reading.star.reading.stars.love}/5</p>
          <p>{reading.fortune.luck.color} · {reading.fortune.luck.luckyHour && `${reading.fortune.luck.luckyHour.start}:00–${reading.fortune.luck.luckyHour.end}:00`} · {reading.fortune.luck.direction}</p>
          <SaveResultImage frame primary title={grades[reading.grade] + " · " + reading.score + "%"} detail={detail} art="/chemi/christmas/result-9x16.webp" />
        </>}
        {state !== "result" && <FanAction variant="primary" loading={busy} onClick={() => state === "empty" ? setBirthOpen(true) : void read()}>
          {state === "empty" ? catalog.christmas.birth : state === "error" ? catalog.readingUi.retry : catalog.readingUi.seeReading}
        </FanAction>}
      </div>
    </div>
    <BirthSheet open={birthOpen} busy={busy} error={null} onClose={() => setBirthOpen(false)} onSave={read} />
  </div>;
}
