"use client";

import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";
import {
  aspectMeaning,
  aspectTitle,
  degreeInSign,
  elementCounts,
  modalityCounts,
  natalAspects,
  signTrait,
} from "./astro";
import { bodyNames, signNames, starChartLine, starCharacters, type StarCharacterId } from "./copy";
import { Legal, Reaction, Toolbar } from "./parts";
import { signList, type StarReading } from "./reading";
import { ChartWheel } from "./wheel";
import styles from "./result.module.css";
import chart from "./chart.module.css";
import { creatorName } from "@/features/fanpage/domain/creator-names";

function countBars(rows: { name: string; count: number }[], label: string) {
  return (
    <div className={chart.bars} role="group" aria-label={label}>
      {rows.map((row) => (
        <div className={chart.barRow} key={row.name}>
          <FanText role="meta">{row.name}</FanText>
          <span
            className={chart.bar}
            role="progressbar"
            aria-label={row.name}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={row.count}
          >
            <i style={{ width: `${row.count * 10}%` }} />
          </span>
          <FanText as="strong" role="item">
            {row.count}
          </FanText>
        </div>
      ))}
    </div>
  );
}

export function StarChart({
  locale,
  reading,
  character,
  onBack,
}: {
  locale: AppLocale;
  reading: StarReading;
  character: StarCharacterId;
  onBack: () => void;
}) {
  const uiText = useReadingCopy();
  const { natal, signs } = reading.result;
  const name = creatorName(character, locale);
  const sunSign = signs.sun.length === 1 ? signs.sun[0]! : null;
  const moonSign = signs.moon.length === 1 ? signs.moon[0]! : null;
  const summary =
    sunSign && moonSign
      ? `${signNames[sunSign].bare}의 ${signTrait[sunSign]}, ${signNames[moonSign].bare}의 ${signTrait[moonSign]}`
      : sunSign
        ? `${signNames[sunSign].bare}의 ${signTrait[sunSign]}`
        : uiText("chart");
  const elements = elementCounts(natal);
  const dominant = [...elements].sort((a, b) => b.count - a.count)[0]!;
  const aspects = natalAspects(natal).slice(0, 4);
  const said = starChartLine(character, dominant.name, dominant.count);
  return (
    <article data-star-chart="" className={styles.layout}>
      <Toolbar
        name={name}
        back={onBack}
        meta={
          <FanText role="meta" as="span">
            <ReadingText id="chart" />
          </FanText>
        }
      />
      <div className={styles.main}>
        <header className={styles.head}>
          <FanText as="p" role="meta">
            {reading.result.timeKnown ? uiText("tropicalTime") : uiText("tropicalNoTime")}
          </FanText>
          <FanHeading as="h1">{summary}</FanHeading>
        </header>
        <section className={`${styles.panel} ${styles.domainPanel} ${chart.wheelPanel}`}>
          <ChartWheel planets={natal} />
          <div className={styles.cards}>
            <div className={styles.card}>
              <FanText role="meta"><ReadingText id="sun" /></FanText>
              <FanText role="item">{signList(signs.sun, (s) => signNames[s].bare)}</FanText>
            </div>
            <div className={styles.card}>
              <FanText role="meta"><ReadingText id="moonMood" /></FanText>
              <FanText role="item">{signList(signs.moon, (s) => signNames[s].bare)}</FanText>
            </div>
          </div>
        </section>
        <div className={chart.split}>
          <section className={`${styles.section} ${styles.todaySec}`}>
            <FanHeading><ReadingText id="planets" /></FanHeading>
            <ul className={chart.planets}>
              {natal.map((planet) => (
                <li data-row="star" key={planet.body}>
                  <FanText as="strong" role="item">
                    {bodyNames[planet.body]}
                  </FanText>
                  <FanText role="body">{signNames[planet.sign].full}</FanText>
                  <FanText role="meta">{degreeInSign(planet.longitude)}</FanText>
                </li>
              ))}
            </ul>
          </section>
          <div className={chart.splitSide}>
            <section className={`${styles.section} ${styles.whySec}`}>
              <FanHeading><ReadingText id="elements" /></FanHeading>
              <div className={chart.barGroups}>
                {countBars(elements, uiText("element"))}
                {countBars(modalityCounts(natal), uiText("modality"))}
              </div>
            </section>
            {aspects.length > 0 && (
              <section className={`${styles.section} ${styles.chartSec}`}>
                <FanHeading><ReadingText id="angles" /></FanHeading>
                <ul className={chart.aspects}>
                  {aspects.map((aspect) => (
                    <li data-row="star" key={`${aspect.a}${aspect.b}${aspect.angle}`}>
                      <FanText as="strong" role="item">
                        {aspectTitle(aspect.a, aspect.b)}
                      </FanText>
                      <FanText role="meta">{aspectMeaning[aspect.angle]}</FanText>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
      <aside className={styles.side}>
        <Reaction
          character={character}
          name={name}
          line={said}
          action={
            <FanAction variant="primary" fullWidth href={`/chemi?locale=${locale}`}>
              <ReadingText id="otherFortunes" />
            </FanAction>
          }
        />
        <Legal />
      </aside>
    </article>
  );
}
