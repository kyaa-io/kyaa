"use client";

import { pillarLabel } from "@/app/chemi/saju/terms-i18n";
import type { ReactNode } from "react";
import { DeepResultAsk, useDeepResultAsk } from "@/features/chemi/ask/deep-result-ask";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDisclosure } from "@/components/fan-ui/fan-collapsible";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton, FanSkeletonRows, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import type { AppLocale } from "@/i18n/locales";
import { DatePurchase } from "../date-purchase";
import { creatorName } from "@/features/fanpage/domain/creator-names";
import type { FortuneCharacterId } from "../lines";
import { band } from "../result-copy";
import result from "../result.module.css";
import {
  dayCardKind,
  dayLabel,
  deepArt,
  flowKey,
  gradeKey,
  luckValue,
  periodKey,
  scoreLevel,
  voiced,
  type OpenDay,
} from "./copy";
import { DayCardThumb } from "./day-card";
import styles from "./deep.module.css";
import { useFortuneWeek } from "./use-week";

type View = "tomorrow" | "week";
type Props = {
  view: View;
  character: FortuneCharacterId;
  locale: AppLocale;
  /** 오늘 결과의 저장 번호. 있으면 뒤로 가기가 그 결과로 돌아간다. */
  readingId?: string;
  /** 결제 연결 전에는 DEV 시험 모드에서만 날짜 지정을 보인다. */
  paidPreview: boolean;
};

const summaryKeys = { high: "depthHigh", mid: "depthMid", low: "depthLow" } as const;
const fieldRows = [
  ["fandom", "fandom"],
  ["people", "people"],
  ["work", "work"],
  ["health", "rest"],
  ["love", "love"],
  ["money", "money"],
] as const;
const periods = [
  ["morning", 5, 11],
  ["afternoon", 11, 17],
  ["night", 17, 23],
] as const;

export function deepHref(view: View | "card", props: { character: string; locale: string; readingId?: string }) {
  const query = new URLSearchParams({ locale: props.locale, c: props.character });
  if (props.readingId) query.set("r", props.readingId);
  if (view === "card") return `/chemi/fortune/card?${query}`;
  query.set("view", view);
  return `/chemi/fortune/deep?${query}`;
}

export function resultHref({ character, locale, readingId }: { character: string; locale: string; readingId?: string }) {
  const query = new URLSearchParams({ locale, c: character });
  if (readingId) {
    query.set("step", "result");
    query.set("r", readingId);
  }
  return `/chemi/fortune?${query}`;
}

/** 갈 곳이 있으면 링크, 없으면 같은 모양의 줄. */
function Row({ href, children, ...rest }: { href?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement> & { "data-level"?: number }) {
  return href ? (
    <a href={href} {...rest}>
      {children}
    </a>
  ) : (
    <div {...rest}>{children}</div>
  );
}

export function FortuneDeep(props: Props) {
  const { view, character, locale } = props;
  const text = useReadingCopy();
  const week = useFortuneWeek();
  const ask = useDeepResultAsk(locale, "fortune", character);
  const name = creatorName(character, locale);
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
  if (week.status === "guest" || week.status === "expired")
    return (
      <FanState
        kind="auth"
        title={text(week.status === "expired" ? "expired" : "fortuneLogin")}
        actions={<FanAction onClick={week.login}><ReadingText id="login" /></FanAction>}
      />
    );
  if (week.status === "birth")
    return <FanState kind="empty" title={text("noResult")} action={{ href: back, label: text("todayFortune") }} />;
  if (week.status !== "ready")
    return (
      <section className={styles.page} data-fortune-deep={view}>
        {toolbar()}
        <div className={styles.main}>
          {week.status === "loading" ? (
            <>
              <FanSkeletonStatus locale={locale} />
              <FanSkeleton width="55%" />
              <FanSkeleton shape="block" height={160} />
              <div className={result.panel} aria-hidden="true">
                <FanSkeletonRows rows={4} />
              </div>
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
  const [today, tomorrow, after] = week.days;
  const short = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;
  const other = view === "tomorrow" ? "week" : "tomorrow";
  const side = (line: string, secondary: ReactNode, detail: ReactNode) => (
    <aside className={styles.side}>
      <div className={styles.cta}>
        <div className={styles.say}>
          <img src={`/chemi/fortune/avatar-${character}-v1.jpg`} alt="" />
          <FanText as="strong" role="item">
            {name}
          </FanText>
          <FanText as="p" role="body">
            {line}
          </FanText>
        </div>
        <DeepResultAsk name={name} reading={() => week.saveContext(view, character, week.today)} />
        <div className={`${styles.sideActions} ${styles.desktopOnly}`}>{secondary}</div>
      </div>
      <div className={styles.sideDetail}>{detail}</div>
      <footer className={styles.legal}>
        <FanText as="p" role="meta">
          <ReadingText id="fun" />
        </FanText>
      </footer>
    </aside>
  );
  const todayAction = (
    <>
      <FanAction href={back}>
        <ReadingText id="todayFortune" />
      </FanAction>
      <FanAction href={deepHref(other, props)}><ReadingText id={other === "week" ? "deepWeek" : "deepTomorrow"} /></FanAction>
    </>
  );

  if (view === "tomorrow") {
    const { result: r, day } = tomorrow;
    const base = today.result;
    const delta = (value: number, from: number) => {
      const diff = value - from;
      if (!diff) return null;
      return (
        <span
          className={styles.delta}
          data-up={diff > 0 || undefined}
          aria-label={text(diff > 0 ? "vsTodayUp" : "vsTodayDown", { points: Math.abs(diff) })}
        >
          <FanIcon icon={diff > 0 ? ArrowUp : ArrowDown} size={16} />
          <FanText role="label">{Math.abs(diff)}</FanText>
        </span>
      );
    };
    const top = Math.max(...fieldRows.slice(0, 4).map(([, key]) => r.fields[key]));
    const row = ([label, key]: (typeof fieldRows)[number]) => (
      <div className={styles.cmp} key={key} data-top={r.fields[key] === top || undefined}>
        <FanText role="meta">{text(label)}</FanText>
        <FanNumber locale={locale} value={r.fields[key]} />
        <span
          className={styles.cmpBar}
          role="progressbar"
          aria-label={text(label)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={r.fields[key]}
        >
          <i style={{ width: `${r.fields[key]}%` }} />
          <u style={{ "--at": `${base.fields[key]}%` } as React.CSSProperties} aria-hidden="true" />
        </span>
        {delta(r.fields[key], base.fields[key])}
      </div>
    );
    const bestPeriod = Math.max(...periods.map(([key]) => r.periods[key]));
    const diff = r.score - base.score;
    const trend = [
      [text("today"), today.result.score, false],
      [text("tomorrow"), r.score, true],
      [text("dayAfter"), after.result.score, false],
    ] as const;
    return (
      <article className={styles.page} data-fortune-deep="tomorrow">
        {toolbar(text("tomorrowMeta", { date: dayLabel(locale, day, { month: "long", day: "numeric" }) }))}
        <div className={styles.main}>
          <header className={styles.head}>
            <FanText as="p" role="meta">
              {dayLabel(locale, day, { month: "long", day: "numeric", weekday: "long" })} ·{" "}
              {text("pillarDay", { pillar: pillarLabel(r.evidence.dayPillar, locale) })}
            </FanText>
            <FanHeading as="h1">{text(summaryKeys[band(r.score)])}</FanHeading>
            <picture className={`${result.hero} ${styles.heroArt}`}>
              <img src={deepArt("tomorrow", character)} alt="" />
            </picture>
          </header>
          <section className={`${result.panel} ${styles.pair}`}>
            <div>
              <div className={styles.scoreRow}>
                <FanNumber size="xl" locale={locale} value={r.score} />
                <FanHeading as="h2">{text(gradeKey(r.score))}</FanHeading>
                {diff !== 0 && (
                  <span
                    className={styles.delta}
                    data-up={diff > 0 || undefined}
                    aria-label={text(diff > 0 ? "vsTodayUp" : "vsTodayDown", { points: Math.abs(diff) })}
                  >
                    <FanIcon icon={diff > 0 ? ArrowUp : ArrowDown} size={16} />
                    <FanText role="label">{text("vsToday", { points: Math.abs(diff) })}</FanText>
                  </span>
                )}
              </div>
              <div className={styles.cmpList}>{fieldRows.slice(0, 4).map(row)}</div>
              <FanDisclosure label={text("loveMoney")}>
                <div className={styles.cmpList}>{fieldRows.slice(4).map(row)}</div>
              </FanDisclosure>
            </div>
            <div>
              <FanHeading as="h2">
                <ReadingText id="threeDays" />
              </FanHeading>
              <FanText as="p" role="body">
                {text(diff > 0 ? "trendRise" : diff < 0 ? "trendFall" : "trendEven")}
              </FanText>
              <div className={styles.trend}>
                {trend.map(([label, score, current]) => (
                  <div key={label} aria-current={current || undefined}>
                    <span className={styles.trendCol}>
                      <FanText as="strong" role="item">
                        {score}
                      </FanText>
                      <i style={{ "--v": (score / 100).toFixed(2) } as React.CSSProperties} />
                    </span>
                    <FanText role="meta">{label}</FanText>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className={styles.section}>
            <FanHeading>
              <ReadingText id="tomorrowFlow" />
            </FanHeading>
            <FanText as="p" role="body">
              {text(flowKey(r.score))}
            </FanText>
          </section>
          <section className={styles.section}>
            <FanHeading>
              <ReadingText id="timeWindow" />
            </FanHeading>
            <div className={styles.times}>
              {periods.map(([key, start, end]) => (
                <div className={styles.time} key={key} data-best={r.periods[key] === bestPeriod || undefined}>
                  <FanText as="strong" role="label">
                    {text(key)}
                  </FanText>
                  <FanNumber size="lg" locale={locale} value={r.periods[key]} />
                  <FanText role="meta">
                    {text("hourRange", { start, end })}
                  </FanText>
                  <FanText as="p" role="meta">
                    {text(periodKey(key, r.periods[key]))}
                  </FanText>
                </div>
              ))}
            </div>
          </section>

          <div className={styles.mobileOnly}>{todayAction}</div>
        </div>
        {side(text(voiced("sayTomorrow", character)), todayAction, (
          <section className={styles.section}>
            <FanHeading>
              <ReadingText id="tomorrowLuck" />
            </FanHeading>
            <dl className={styles.luck}>
              {(
                [
                  [text("color"), luckValue(r.luck.color, locale)],
                  [text("number"), r.luck.number],
                  [text("item"), luckValue(r.luck.item, locale)],
                  [text("luckyTime"), r.luck.luckyHour && text("hourRange", { start: r.luck.luckyHour.start, end: r.luck.luckyHour.end })],
                ] as const
              ).map(
                ([label, value]) =>
                  value != null && (
                    <div key={label}>
                      <FanText as="dt" role="meta">
                        {label}
                      </FanText>
                      <FanText as="dd" role="item">
                        {value}
                      </FanText>
                    </div>
                  ),
              )}
            </dl>
          </section>
        ))}
      </article>
    );
  }

  const days = week.days;
  const dayTitle = (row: OpenDay) => dayLabel(locale, row.day, { month: "long", day: "numeric", weekday: "short" });
  const sorted = [...days].sort((a, b) => b.result.score - a.result.score);
  // 눈여겨볼 날: 가장 높은 날, 그다음 높은 날, 가장 낮은 날(같은 날은 한 번만).
  const notable = [...new Set([sorted[0], sorted[1], sorted[sorted.length - 1]])];
  const usedDescriptions = new Set<string>();
  const fieldTips = { fandom: "depthFandomA", people: "depthPeopleA", money: "depthMoneyA",
    rest: "depthRestA", work: "depthWorkA", love: "depthLoveA" } as const;
  const descriptions = notable.map(({ result }) => {
    const ranked = [...fieldRows].sort(([, a], [, b]) => result.fields[b] - result.fields[a]);
    const choices = [text(flowKey(result.score)), ...ranked.map(([, key]) => text(fieldTips[key]))];
    const description = choices.find(choice => !usedDescriptions.has(choice)) ?? choices[0];
    usedDescriptions.add(description);
    return description;
  });
  return (
    <article className={styles.page} data-fortune-deep="week">
      {toolbar(text("weekMeta", { from: short(days[0].day), to: short(days[6].day) }))}
      <div className={styles.main}>
        <FanHeading as="h1">
          <ReadingText id="deepWeek" />
        </FanHeading>
        <section className={styles.section}>
          <FanHeading>
            <ReadingText id="weekScores" />
          </FanHeading>
          <div className={`${result.panel} ${styles.chart}`}>
            <ol className={styles.bars}>
              {days.map((row, index) => {
                const { score } = row.result;
                const kind = dayCardKind(score);
                const label = text("dayScore", { date: dayTitle(row), score, grade: text(gradeKey(score)) });
                return (
                  <li key={row.day} data-row="">
                    <Row
                      href={index === 0 ? back : index === 1 ? deepHref("tomorrow", props) : undefined}
                      aria-current={index === 0 ? "date" : undefined}
                      aria-label={label}
                      data-level={scoreLevel(score)}
                    >
                      <span className={styles.barTop}>
                        {kind && <DayCardThumb kind={kind} character={character} />}
                        <FanText as="strong" role="item">
                          {score}
                        </FanText>
                      </span>
                      <i style={{ "--v": (score / 100).toFixed(2) } as React.CSSProperties} />
                      <FanText role={index === 0 ? "label" : "meta"}>
                        {index === 0 ? text("today") : dayLabel(locale, row.day, { weekday: "short" })}
                      </FanText>
                      <FanText as="strong" role="item">
                        {Number(row.day.slice(8))}
                      </FanText>
                    </Row>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
        <div>
          <section className={styles.section}>
            <FanHeading>
              <ReadingText id="weekFields" />
            </FanHeading>
            <table className={styles.heat}>
              <thead>
                <tr>
                  <th scope="col" />
                  {days.map((row) => (
                    <th scope="col" key={row.day}>
                      <FanText role="meta">{dayLabel(locale, row.day, { weekday: "short" })}</FanText>
                      <FanText role="label">{Number(row.day.slice(8))}</FanText>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldRows.map(([label, key]) => (
                  <tr key={key}>
                    <th scope="row">
                      <FanText role="label">{text(label)}</FanText>
                    </th>
                    {days.map((row) => (
                      <td key={row.day} data-level={scoreLevel(row.result.fields[key])}>
                        <FanText role="meta">{row.result.fields[key]}</FanText>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </div>
        {props.paidPreview && (
          <section className={styles.section}>
            <div className={styles.devHead}>
              <FanHeading>
                <ReadingText id="byDate" />
              </FanHeading>
            </div>
            <DatePurchase character={character} locale={locale} />
          </section>
        )}
        <div className={styles.mobileOnly}>{todayAction}</div>
      </div>
      {side(text(voiced("sayWeek", character)), todayAction, (
          <section className={styles.section}>
            <FanHeading>
              <ReadingText id="weekNotable" />
            </FanHeading>
            <ol className={styles.dayList}>
              {notable.map((row, index) => {
                const { score } = row.result;
                const kind = dayCardKind(score);
                const isToday = row.day === week.today;
                const href = isToday ? (kind ? deepHref("card", props) : back) : row === tomorrow ? deepHref("tomorrow", props) : undefined;
                return (
                  <li key={row.day} data-row="">
                    <Row href={href}>
                      {kind ? (
                        <DayCardThumb kind={kind} character={character} />
                      ) : (
                        <span className={styles.badge}>
                          <FanText as="strong" role="item">
                            {score}
                          </FanText>
                        </span>
                      )}
                      <span>
                        <FanText as="strong" role="item">
                          {isToday ? text("todayMark", { date: dayTitle(row) }) : dayTitle(row)}
                        </FanText>
                        <FanText role="label" className={styles.grade}>
                          {text("scoreGrade", { score, grade: text(gradeKey(score)) })}
                        </FanText>
                        <FanText as="p" role="meta">
                          {descriptions[index]}
                        </FanText>
                      </span>
                      {href && <FanIcon icon={ChevronRight} />}
                    </Row>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
    </article>
  );
}
