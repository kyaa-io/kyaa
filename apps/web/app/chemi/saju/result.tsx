"use client";

/**
 * 최애 사주 풀이 화면(승인 시안 03-2 결과·03-4 올해·이달·03-5 궁합).
 * 390은 한 열(최애 한마디 + 큰 버튼이 탭바 위에 고정), 1024+는 본문 + 오른쪽 레일.
 * 주 버튼은 이 결과로 질문하기(궁합 풀이는 친구에게 공유하기), 그 아래 보조 행동 한 줄(자랑하기 · 다른 놀이 보기).
 * 조언 이미지 저장과 장면 다시 보기는 자랑하기 판 안에 있다. 유료 주제는 결제가 붙기 전이라 자리를 두지 않는다.
 */
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Droplet, Flame, Gem, Mountain, Sprout } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanAction } from "@/components/fan-ui/fan-action";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { defaultShareVia, ResultActions, ShareSheet, type ShareVia } from "@/features/chemi/ui/result/result-actions";
import { ReadingBasis, ReadingDomains } from "@/features/chemi/ui/result/reading-depth";
import { askVoice } from "@/features/chemi/ask/lines";
import { saveAdviceImage } from "./advice-image";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import type { Chart, Element } from "./chart";
import {
  firstReading,
  monthReading,
  pairReading,
  yearReading,
} from "./copy";
import { sajuBasis, sajuDomains } from "./depth";
import { sajuCharacters, sajuOpening, sajuTone, type SajuCharacterId } from "./lines";
import type { PairResult } from "./reading";
import styles from "./result.module.css";

/** 타고난 기운 줄 앞의 오행 그림. */
const elementIcon: Record<Element, typeof Sprout> = {
  wood: Sprout,
  fire: Flame,
  earth: Mountain,
  metal: Gem,
  water: Droplet,
};

export type ResultView = "first" | "year" | "month" | "pair";

export type Pair = {
  /** 궁합 풀이 번호(주소의 p) */
  id: string;
  name: string;
  result: PairResult;
  /** 상대 출생 시간을 알고 본 궁합인가 */
  timeKnown: boolean;
};

const hero = (character: SajuCharacterId) =>
  character === "changha"
    ? "/chemi/saju/saju-changha-wide-v1.webp"
    : `/chemi/saju/saju-${character}-wide-v2.webp`;

const levelWidth = { 많이: 92, 보통: 56, 조금: 28 } as const;

export function SajuResult({
  locale,
  character,
  view,
  chart,
  at,
  points,
  exp,
  pair,
  sharing,
  backLabel,
  onBack,
  onShare,
  onAsk,
  onTopics,
  onGo,
  onScene,
  onPair,
  onBirthTime,
}: {
  locale: AppLocale;
  character: SajuCharacterId;
  view: ResultView;
  chart: Chart;
  at: number;
  points: number;
  exp: number;
  pair?: Pair;
  sharing: boolean;
  backLabel?: string;
  onBack: () => void;
  onShare: (via: ShareVia) => void;
  onAsk: () => void;
  onTopics: () => void;
  onGo: (view: ResultView) => void;
  onScene: () => void;
  onPair: () => void;
  /** 태어난 시간을 넣으면 열리는 칸에서 시간 입력으로 간다. */
  onBirthTime: () => void;
}) {
  const uiText = useReadingCopy();
  const [shareOpen, setShareOpen] = useState(false);
  const name = sajuCharacters.find((item) => item.id === character)!.name;
  const locked = chart.locked.length > 0;
  const first = firstReading(chart, at);
  const year = yearReading(chart, at);
  const month = monthReading(chart, at);
  const compat =
    view === "pair" && pair
      ? pairReading(
          pair.result.dayStems[0],
          pair.result.dayStems[1],
          pair.result.combinations.length,
          pair.result.clashes.length,
        )
      : null;
  const tone = sajuTone(character);
  const sayLine =
    view === "year"
      ? year.line[askVoice[character]]
      : view === "month"
        ? month.line[askVoice[character]]
        : compat && pair
          ? tone.pairReact(compat.line(pair.name))
          : tone.react({
              image: first.image,
              trait: first.trait,
              strengthN: first.strengthN,
              cautionN: first.cautionN,
              bond: first.bond,
              yearTitle: year.title,
            });

  const kicker =
    view === "pair" && pair
      ? uiText("pairTitle", { name, partner: pair.name })
      : uiText("readingTitle", { name, topic: uiText(view === "year" ? "year" : view === "month" ? "month" : "sajuName") });
  const title =
    view === "first" ? first.headline : view === "year" ? year.title : view === "month" ? month.title : compat!.title;
  const bondKicker = { first: uiText("bondFirst", { name }), year: uiText("bondYear", { name }), month: uiText("bondMonth", { name }), pair: "" }[view];
  const bond = view === "first" ? first.bond : view === "year" ? year.bond : view === "month" ? month.bond : "";

  const bar = (label: string, value: number, top = false) => (
    <span
      className={styles.bar}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      data-top={top || undefined}
    >
      <i style={{ width: `${value}%` }} />
    </span>
  );
  const kv = (rows: readonly (readonly [string, string])[], layout?: "cols" | "stack") => (
    <dl className={styles.kv} data-layout={layout}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <FanText as="dt" role="meta">
            {label}
          </FanText>
          <FanText as="dd" role="item">
            {value}
          </FanText>
        </div>
      ))}
    </dl>
  );
  const chips = (
    items: readonly { label: string; mark?: "good" | "rest"; current: boolean }[],
    names: { good: string; rest: string },
  ) => (
    <ol className={styles.chips} style={{ "--n": items.length } as CSSProperties}>
      {items.map((item) => (
        <li
          key={item.label}
          data-row=""
          data-mark={item.mark}
          data-current={item.current || undefined}
          aria-current={item.current ? "date" : undefined}
        >
          <FanText role={item.mark || item.current ? "label" : "meta"}>{item.label}</FanText>
          {item.mark && <span className={styles.srOnly}>{`, ${names[item.mark]}`}</span>}
        </li>
      ))}
    </ol>
  );
  const stats = (items: readonly (readonly [string, string])[]) => (
    <div className={styles.stats} style={{ "--cols": items.length } as CSSProperties}>
      {items.map(([label, value]) => (
        <div key={label}>
          <FanText role="meta">{label}</FanText>
          <FanText role="item">{value}</FanText>
        </div>
      ))}
    </div>
  );
  // 풀이 근거(계산 값 + 쉬운 풀이)와 영역별 풀이. 궁합은 두 사람 값이라 여기서 다루지 않는다.
  const depth =
    view === "pair" ? null : (
      <>
        <ReadingBasis title={uiText("basis")} rows={sajuBasis(chart, at, view)} />
        <ReadingDomains
          title={uiText("areas")}
          items={sajuDomains(chart, at, view).map((item) => ({
            key: item.key,
            label: uiText(item.key),
            meta: item.level,
            basis: item.basis,
            sentences: item.sentences,
          }))}
        />
      </>
    );
  const lockedCard = (
    <FanState
      inline
      kind="info"
      title={uiText("unlockTime")}
      actions={
        <FanAction size="sm" onClick={onBirthTime}>
          <ReadingText id="birthTime" />
        </FanAction>
      }
    />
  );

  const bondCard =
    view !== "pair" ? (
      <section className={`${styles.panel} ${styles.bondPanel}`}>
        <FanText as="p" role="meta">
          {bondKicker}
        </FanText>
        <FanHeading>{bond}</FanHeading>
        <Rewards locale={locale} points={points} exp={exp} />
      </section>
    ) : (
      <div className={styles.pairReward}>
        <Rewards locale={locale} points={points} exp={exp} />
      </div>
    );

  async function saveAdvice() {
    try {
      const advice = view === "first" ? first.keywords[0].act : compat?.together ?? sayLine;
      await saveAdviceImage(hero(character), new Intl.DateTimeFormat(locale).format(at), advice);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        showFanToast({ title: uiText("retry"), tone: "error" });
      }
    }
  }

  const actions =
    view === "pair" ? (
      <ResultActions locale={locale} lead={<FanAction onClick={onPair}>{uiText("otherPartner")}</FanAction>} />
    ) : (
      <ResultActions locale={locale} sharing={sharing} onShare={() => setShareOpen(true)} />
    );

  return (
    <article data-saju-result={view} className={styles.layout}>
      <div className={styles.toolbar}>
        <FanAction
          onClick={view === "first" ? onScene : onBack}
          ariaLabel={backLabel ?? uiText("back")}
          leadingIcon={<FanIcon icon={ChevronLeft} />}
          className={styles.round}
        />
        <FanText role="label" className={styles.chip}>
          {name}
        </FanText>
      </div>
      <div className={styles.main}>
        <header className={styles.head}>
          <FanText as="p" role="meta">
            {kicker}
          </FanText>
          <FanHeading as="h1">{title}</FanHeading>
          {view === "first" && (
            <>
              <FanText as="p" role="body" className={styles.opening}>
                {sajuOpening(character, first.stem)}
              </FanText>
              <dl className={`${styles.kv} ${styles.keywords}`} data-layout="cols">
                {first.keywords.map((item) => (
                  <div key={item.kind} data-keyword={item.kind}>
                    <FanText as="dt" role="meta">
                      {item.label}
                    </FanText>
                    <dd>
                      <FanText as="strong" role="item">
                        {item.name}
                      </FanText>
                      <FanText as="span" role="meta">
                        {item.act}
                      </FanText>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {view === "pair" && pair && !pair.timeKnown && (
            <FanText as="p" role="meta">
              {uiText("pairNoTime", { name: pair.name })}
            </FanText>
          )}
          <picture className={styles.hero}>
            <img src={hero(character)} alt="" />
          </picture>
        </header>

        {view === "first" && (
          <>
            <div className={styles.summary}>
              <section className={`${styles.panel} ${styles.split}`}>
                <div className={styles.block}>
                  <FanHeading><ReadingText id="energy" /></FanHeading>
                  {locked ? (
                    lockedCard
                  ) : (
                    <div className={styles.bars}>
                      {first.rows.map((row) => (
                        <div className={styles.barRow} key={row.element}>
                          <span className={styles.elementName}>
                            <FanIcon icon={elementIcon[row.element]} size={16} />
                            <FanText role="meta">{row.name}</FanText>
                          </span>
                          <FanNumber locale={locale} value={row.count} />
                          {bar(row.name, Math.round((row.count / 4) * 100))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
            {!locked && (
              <div className={styles.cols}>
                <section className={styles.section}>
                  <FanHeading><ReadingText id="traits" /></FanHeading>
                  {kv([
                    [uiText("strength"), first.strengthR],
                    [uiText("fanStyle"), first.fandomR],
                  ])}
                </section>
                <section className={styles.section}>
                  <FanHeading>{first.flowTitle}</FanHeading>
                  {kv(first.flow.map((item) => [item.label, item.text] as const))}
                </section>
              </div>
            )}
          </>
        )}

        {view === "year" && (
          <>
            <div className={styles.summary}>
              <section className={`${styles.panel} ${styles.split}`}>
                <div className={styles.block}>
                  <FanHeading>{year.name}</FanHeading>
                  <FanText as="p" role="meta">
                    {year.span}
                  </FanText>
                  {year.beforeSpring && (
                    <FanText as="p" role="meta">
                      <ReadingText id="springNote" />
                    </FanText>
                  )}
                  {stats([[uiText("yearGrade"), year.grade]])}
                  {stats(year.rate.map((item) => [item.label, item.level] as const))}
                </div>
              </section>
            </div>
            <section className={styles.section}>
              <FanHeading><ReadingText id="months" /></FanHeading>
              {chips(year.months, { good: uiText("goodMonth"), rest: uiText("restMonth") })}
            </section>
            <section className={styles.section}>
              {kv(
                [
                  [uiText("goodMonth"), year.good],
                  ...(year.rest ? [[uiText("restMonth"), year.rest] as const] : []),
                  ...(year.past ? [[uiText("pastFlow"), year.past] as const] : []),
                  [uiText("helpEnergy"), year.help],
                ],
                "cols",
              )}
            </section>
          </>
        )}

        {view === "month" && (
          <>
            <div className={styles.summary}>
              <section className={`${styles.panel} ${styles.split}`}>
                <div className={styles.block}>
                  <FanHeading>{month.name}</FanHeading>
                  <FanText as="p" role="meta">
                    {month.span}
                  </FanText>
                  {stats(month.rate.map((item) => [item.label, item.level] as const))}
                </div>
              </section>
            </div>
            <section className={styles.section}>
              <FanHeading><ReadingText id="weekly" /></FanHeading>
              {chips(month.weeks, { good: uiText("strongWeek"), rest: uiText("restWeek") })}
            </section>
            <section className={styles.section}>
              {kv(
                [
                  [uiText("strongWeek"), month.strong],
                  ...(month.rest ? [[uiText("restWeek"), month.rest] as const] : []),
                  ...(month.past ? [[uiText("pastFlow"), month.past] as const] : []),
                  [uiText("freshEnergy"), month.nextTerm],
                ],
                "cols",
              )}
            </section>
          </>
        )}

        {view === "pair" && compat && pair && (
          <section className={`${styles.panel} ${styles.pairPanel}`}>
            <div className={styles.block}>
              <FanHeading>{uiText("pairMe", { name: pair.name })}</FanHeading>
              <div className={styles.bars}>
                {compat.rows.map((row) => (
                  <div className={styles.barRowWide} key={row.label}>
                    <FanText role={row.top ? "label" : "meta"} className={styles.topLabel} data-top={row.top || undefined}>
                      {row.label}
                    </FanText>
                    <FanText role="item">{row.level}</FanText>
                    {bar(row.label, levelWidth[row.level], row.top)}
                  </div>
                ))}
              </div>
              {compat.notes.map((note) => (
                <FanText as="p" role="meta" className={styles.pairNote} key={note.label}>
                  {note.label} · {note.text}
                </FanText>
              ))}
            </div>
            {kv(
              [
                [uiText("bothEnergy"), compat.powers],
                [uiText("clash"), compat.clash],
                [uiText("togetherWhen"), compat.together],
              ],
              "stack",
            )}
          </section>
        )}

        {depth}

        <div className={styles.mobileActions}>{actions}</div>
        <div className={styles.dockSpace} aria-hidden="true" />
        <footer className={styles.legal}>
          <FanText as="p" role="meta">
            <ReadingText id="outlookNote" />
          </FanText>
          {view === "pair" && (
            <FanText as="p" role="meta">
              <ReadingText id="relationshipNote" />
            </FanText>
          )}
        </footer>
      </div>

      <aside className={styles.side}>
        <div className={styles.dock}>
          <section className={styles.reaction}>
            <img src={`/chemi/saju/avatar-${character}-v1.jpg`} alt="" />
            <FanText as="strong" role="item" className={styles.said}>
              {name}
            </FanText>
            <FanText as="p" role="body">
              {sayLine}
            </FanText>
          </section>
          <div className={styles.cta}>
            <FanAction variant="primary" fullWidth disabled={view === "pair" && sharing} onClick={view === "pair" ? () => onShare(defaultShareVia()) : onAsk}>
              <ReadingText id={view === "pair" ? "shareFriend" : "askFromResult"} />
            </FanAction>
          </div>
          <div className={styles.desktopOnly}>{actions}</div>
        </div>
        {view !== "pair" && bondCard}
        {(view === "year" || view === "month") && (
          <nav className={styles.nextList} aria-label={uiText("deeper")}>
            <FanAction variant="text" className={styles.nextItem} onClick={onTopics}>
              <span className={styles.nextRow}>
                <FanText role="item">{uiText("otherTopics")}</FanText>
                <FanIcon icon={ChevronRight} />
              </span>
            </FanAction>
          </nav>
        )}
        {view === "first" && (
          <nav className={styles.nextList} aria-label={uiText("deeper")}>
            <FanText as="p" role="item" className={styles.nextTitle}>
              {uiText("deeper")}</FanText>
            {(
              [
                [uiText("year"), uiText("free"), "year"],
                [uiText("month"), uiText("free"), "month"],
              ] as const
            ).map(([label, tag, target]) => (
              <FanAction variant="text" key={label} className={styles.nextItem} onClick={() => onGo(target)}>
                <span className={styles.nextRow}>
                  <FanText role="item">{label}</FanText>
                  <FanText role="meta">{tag}</FanText>
                  <FanIcon icon={ChevronRight} />
                </span>
              </FanAction>
            ))}
            <FanAction variant="text" className={styles.nextItem} onClick={onPair}>
              <span className={styles.nextRow}>
                <FanText role="item">{uiText("match")}</FanText>
                <FanText role="meta"><ReadingText id="dailyFree" /></FanText>
                <FanIcon icon={ChevronRight} />
              </span>
            </FanAction>
          </nav>
        )}
      </aside>
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        sharing={sharing}
        onShare={(via) => {
          setShareOpen(false);
          onShare(via);
        }}
      >
        <FanAction onClick={saveAdvice}><ReadingText id="saveAdvice" /></FanAction>
        {view === "first" && (
          <FanAction
            onClick={() => {
              setShareOpen(false);
              onScene();
            }}
          >
            <ReadingText id="replay" />
          </FanAction>
        )}
      </ShareSheet>
    </article>
  );
}

function Rewards({ locale, points, exp }: { locale: AppLocale; points: number; exp: number }) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.rewardRow}>
      {points > 0 && <EarnBadge locale={locale} points={points} variant="inline" />}
      {exp > 0 && <FanText role="meta">{uiText("affinityGain", { exp: exp })}</FanText>}
    </div>
  );
}
