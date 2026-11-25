"use client";

import { pillarLabel } from "@/app/chemi/saju/terms-i18n";
import { useState } from "react";
import { DeepResultAsk, useDeepResultAsk } from "@/features/chemi/ask/deep-result-ask";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronLeft, Download } from "@/components/fan-ui/fan-icons";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import type { AppLocale } from "@/i18n/locales";
import { dayCardKind, dotted, gradeKey, voiced } from "../deep/copy";
import { DayCard } from "../deep/day-card";
import styles from "../deep/deep.module.css";
import { resultHref } from "../deep/screen";
import { useFortuneWeek } from "../deep/use-week";
import { fortuneCharacters, type FortuneCharacterId } from "../lines";
import { kstWeekday } from "../result-copy";
import result from "../result.module.css";
import { downloadCardImage, renderCardImage, shareCardImage } from "./card-image";

type Props = { character: FortuneCharacterId; locale: AppLocale; readingId?: string };

/** 오늘의 카드 상세. 아주 좋은 날이면 기념 카드, 쉬어 가는 날이면 응원 부적, 그 밖의 날에는 카드가 없다. */
export function FortuneCard(props: Props) {
  const { character, locale } = props;
  const text = useReadingCopy();
  const week = useFortuneWeek();
  const ask = useDeepResultAsk(locale, "fortune", character);
  const [busy, setBusy] = useState(false);
  const name = fortuneCharacters.find((item) => item.id === character)?.name ?? "";
  const back = resultHref(props);
  const toolbar = (meta?: string) => (
    <div className={`${result.toolbar} ${styles.toolbarRow}`}>
      <FanAction href={back} ariaLabel={text("back")} leadingIcon={<FanIcon icon={ChevronLeft} />} className={result.round} />
      <FanText role="label" className={result.chip}>
        {name}
      </FanText>
      {meta && (
        <FanText as="span" role="meta">
          {meta}
        </FanText>
      )}
    </div>
  );
  if (ask) return ask;
  if (week.status === "guest")
    return (
      <FanState
        kind="auth"
        title={text("fortuneLogin")}
        actions={<FanAction onClick={week.login}><ReadingText id="login" /></FanAction>}
      />
    );
  if (week.status === "loading" || week.status === "error")
    return (
      <section className={styles.page} data-fortune-card="">
        {toolbar()}
        <div className={styles.main}>
          {week.status === "loading" ? (
            <>
              <FanSkeletonStatus locale={locale} />
              <FanSkeleton shape="block" height={440} />
            </>
          ) : (
            <FanState
              inline
              bodyTitle
              kind="error"
              title={text("fortuneFailure")}
              actions={<FanAction size="sm" onClick={week.retry}><ReadingText id="retry" /></FanAction>}
            />
          )}
        </div>
      </section>
    );
  const today = week.status === "ready" ? week.days[0] : null;
  const kind = today ? dayCardKind(today.result.score) : null;
  if (!today || !kind)
    return <FanState kind="empty" title={text("cardNone")} action={{ href: back, label: text("todayFortune") }} />;
  const { score, evidence } = today.result;
  const date = `${dotted(today.day)} ${kstWeekday(locale, Date.parse(`${today.day}T12:00:00+09:00`))}`;
  const grade = text(gradeKey(score));
  const image = () =>
    renderCardImage({ kind, character, name, date, score, grade, hand: text(voiced("amuletHand", character)) });
  async function run(action: "save" | "share") {
    if (busy) return;
    setBusy(true);
    try {
      const file = await image();
      if (action === "save") downloadCardImage(file);
      if (action === "save" || (await shareCardImage(file)) === "saved")
        showFanToast({ title: text("cardSaved"), tone: "success" });
    } catch (error) {
      // 공유 창을 닫은 것은 실패가 아니다.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        showFanToast({ title: text("cardSaveFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const keepsake = kind === "keepsake";
  const facts = (
    <dl className={styles.facts}>
      {(
        [
          [text("cardDate"), date],
          [text("cardScore"), text("scoreGrade", { score, grade })],
          [text("tableDaypillar"), text("pillarDay", { pillar: pillarLabel(evidence.dayPillar, locale) })],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <FanText as="dt" role="meta">
            {label}
          </FanText>
          <FanText as="dd" role="label">
            {value}
          </FanText>
        </div>
      ))}
    </dl>
  );
  const share = (
    <FanAction disabled={busy} onClick={() => run("share")}>
      <ReadingText id="share" />
    </FanAction>
  );
  return (
    <article className={styles.page} data-fortune-card={kind}>
      {toolbar(text(keepsake ? "keepsakeMeta" : "amuletMeta", { date: date.slice(5) }))}
      <div className={styles.main}>
        <div className={styles.stage} data-kind={kind}>
          <DayCard kind={kind} character={character} day={today.day} score={score} locale={locale} />
        </div>
        <div className={styles.mobileFacts}>{facts}</div>
      </div>
      <aside className={styles.side}>
        <div className={styles.cta}>
          <div className={styles.say}>
            <img src={`/chemi/fortune/avatar-${character}-v1.jpg`} alt="" />
            <FanText as="strong" role="item">
              {name}
            </FanText>
            <FanText as="p" role="body">
              {text(voiced(keepsake ? "sayKeep" : "sayAmulet", character))}
            </FanText>
          </div>
          <DeepResultAsk name={name} reading={() => week.saveContext(kind, character, today.day)} />
          <div className={styles.cardSecondary}>
            <FanAction
              disabled={busy}
              leadingIcon={<FanIcon icon={Download} />}
              onClick={() => run("save")}
            >
              <ReadingText id="saveCard" />
            </FanAction>
            {share}
            <FanAction href={back}>
              <ReadingText id="todayFortune" />
            </FanAction>
          </div>
        </div>
        <div className={`${result.panel} ${styles.desktopOnly}`}>{facts}</div>
        <footer className={styles.legal}>
          <FanText as="p" role="meta">
            <ReadingText id="fun" />
          </FanText>
        </footer>
      </aside>
    </article>
  );
}
