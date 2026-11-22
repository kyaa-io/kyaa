"use client";

/**
 * 사주 첫 풀이의 전문 블록(시안 CHEMI-G97-N-1122 2회차). 명식표 판 · 타고난 기운 · 타고난 성격 · 신강·신약 ·
 * 십신 분포 · 합·충 · 올해 흐름. 절기 날 + 시간 모름이면 월주를 모르는 네 블록은 같은 줄 이름에 흐린 줄로 잠근다.
 * 1024px부터 두 블록씩 짝지어 두 열, 390은 한 열이다(배치는 result.module.css 의 .cols).
 */
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Droplet, Flame, Gem, LockKeyhole, Mountain, Sprout } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanHanja } from "@/components/fan-ui/fan-hanja";
import { FanText } from "@/components/fan-ui/fan-text";
import { useReadingCopy, ReadingText } from "@/features/chemi/i18n/reading-ui";
import { ReadingBasisRows } from "@/features/chemi/ui/result/reading-depth";
import { PillarSheet } from "@/features/chemi/ui/result/pillar-sheet";
import type { AppLocale } from "@/i18n/locales";
import { branchHanja, elements, elementHanja, elementName, pillarKeys, stemHanja, tenGodGroups, type Chart, type Element } from "./chart";
import {
  elementView,
  natureRows,
  relationRows,
  scopeLabel,
  sheetColumns,
  sheetDetail,
  sheetLabel,
  strengthView,
  tenGodView,
  termNote,
  yearFlowView,
  groupPlain,
} from "./first";
import styles from "./first-blocks.module.css";

const elementIcon: Record<Element, typeof Sprout> = { wood: Sprout, fire: Flame, earth: Mountain, metal: Gem, water: Droplet };

function Head({ title, scope, locked, children }: { title: ReactNode; scope?: string | null; locked?: boolean; children?: ReactNode }) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.secHead}>
      <FanHeading>{title}</FanHeading>
      {locked ? (
        <span className={styles.lockMark} role="img" aria-label={uiText("unlockTime")}>
          <FanIcon icon={LockKeyhole} size={16} />
        </span>
      ) : scope ? (
        <FanText role="meta">{scope}</FanText>
      ) : null}
      {children}
    </div>
  );
}

/** 잠긴 블록의 흐린 줄. 첫 줄은 값 높이, 나머지는 설명 높이. 로딩 뼈대와 헷갈리지 않게 점선 테두리만 둔다. */
function Faint({ widths }: { widths: readonly number[] }) {
  return (
    <>
      {widths.map((width, i) => (
        <i key={i} className={styles.faint} data-value={i === 0 || undefined} style={{ width: `${width}%` }} />
      ))}
    </>
  );
}
function FaintRows({ rows }: { rows: readonly (readonly [string, ...number[]])[] }) {
  return (
    <dl className={styles.rows} aria-hidden="true">
      {rows.map(([term, ...widths]) => (
        <div key={term}>
          <FanText as="dt" role="meta">
            {term}
          </FanText>
          <dd>
            <Faint widths={widths} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 명식표 판. 1024px부터 오른쪽에 최애 장면 그림을 3 : 2 로 둔다. */
export function ChartPanel({ chart, art, onBirthTime }: { chart: Chart; art: string; onBirthTime: () => void }) {
  const uiText = useReadingCopy();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const termLocked = !chart.pillars.month;
  const detail = sheetDetail(chart);
  const note = termNote(chart);
  return (
    <section className={`${styles.panel} ${styles.chart}`} data-saju-chart="">
      <div className={styles.chartTop}>
        <div className={styles.chartLeft}>
          <Head title={<ReadingText id="chartTitle" />}>
            {!termLocked && (
              <FanSectionLink onClick={() => setOpen((value) => !value)} expanded={open} controls={detailId} className={styles.toggle}>
                {uiText(open ? "hideDetail" : "showDetail")}
              </FanSectionLink>
            )}
          </Head>
          <PillarSheet columns={sheetColumns(chart)} label={sheetLabel(chart)} open={open} unknownLabel={uiText("unlockTime")} />
          {(note || !chart.timeKnown) && (
            <div className={styles.lockBox}>
              {note ? (
                <FanText as="p" role="meta" className={styles.ink}>
                  {note}
                </FanText>
              ) : (
                <FanText as="p" role="label" className={styles.lockLine}>
                  <FanIcon icon={LockKeyhole} size={16} />
                  <ReadingText id="hourLocked" />
                </FanText>
              )}
              <FanAction size="sm" onClick={onBirthTime}>
                <ReadingText id="birthTime" />
              </FanAction>
            </div>
          )}
        </div>
        <div className={styles.art}>
          <img src={art} alt="" />
        </div>
      </div>
      <div id={detailId} className={styles.detail} hidden={!open}>
        {open && (
          <>
            <div className={styles.legend}>
              <div className={styles.legendGroup}>
                <FanText as="p" role="label">
                  12운성 <FanText role="meta">일간이 그 자리에서 갖는 힘</FanText>
                </FanText>
                <ul>
                  {detail.stages.map((item) => (
                    <li key={item.seat} data-row="">
                      <FanText role="meta">
                        {item.seat} {item.hanja}
                      </FanText>
                      <FanText role="label">{item.name}</FanText>
                      <FanText role="meta">{item.plain}</FanText>
                    </li>
                  ))}
                </ul>
              </div>
              {detail.spirits.length > 0 && (
                <div className={styles.legendGroup}>
                  <FanText as="p" role="label">
                    12신살 <FanText role="meta">연지 기준</FanText>
                  </FanText>
                  <ul>
                    {detail.spirits.map((item) => (
                      <li key={item.seat} data-row="">
                        <FanText role="meta">
                          {item.seat} {item.hanja}
                        </FanText>
                        <FanText role="label">{item.name}</FanText>
                        <FanText role="meta">{item.plain}</FanText>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <ReadingBasisRows
              rows={[
                { term: "지장간", value: "진한 글자가 본기예요", plain: "" },
                { term: "공망", value: `${detail.void.hanja} ${detail.void.letters}`, plain: detail.void.plain },
                { term: "계산 기준", value: detail.basis[0], plain: detail.basis[1] },
              ]}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function ElementBlock({ chart, locale }: { chart: Chart; locale: AppLocale }) {
  if (!chart.pillars.month)
    return (
      <section className={styles.section}>
        <Head title={<ReadingText id="energy" />} locked />
        <div className={styles.elements} aria-hidden="true">
          {elements.map((element) => (
            <div key={element}>
              <ElementName element={element} />
              <i className={styles.faint} data-value="" style={{ width: "2.25rem" }} />
              <span className={styles.bar} />
              <span />
            </div>
          ))}
        </div>
        <FaintRows rows={[["가장 많은 기운", 28, 92, 46], ["없는 기운", 22, 94, 88]]} />
      </section>
    );
  const view = elementView(chart);
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="energy" />} scope={scopeLabel(chart)} />
      <div className={styles.elements}>
        {view.rows.map((row) => (
          <div key={row.element} data-zero={row.count === 0 || undefined}>
            <ElementName element={row.element} />
            <FanNumber locale={locale} value={row.percent} unit="%" />
            <span className={styles.bar} data-top={row.top || undefined} role="img" aria-label={`${row.name} ${row.percent}%`}>
              <i style={{ width: `${row.percent}%` }} />
            </span>
            <FanText role={row.count === 0 ? "label" : "meta"} className={styles.count}>
              {row.count}자
            </FanText>
          </div>
        ))}
      </div>
      <ReadingBasisRows rows={view.summary} />
    </section>
  );
}
function ElementName({ element }: { element: Element }) {
  return (
    <span className={styles.elementName}>
      <FanIcon icon={elementIcon[element]} size={16} />
      <FanText role="meta">{elementName[element]}</FanText>
      <FanText role="body" className={styles.ink}>
        <FanHanja role="inline">{elementHanja[element]}</FanHanja>
      </FanText>
    </span>
  );
}

export function NatureBlock({ chart }: { chart: Chart }) {
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="traits" />} />
      <ReadingBasisRows rows={natureRows(chart)} />
    </section>
  );
}

const zones = [
  ["신약", 21],
  ["중화", 50],
  ["신강", 79],
] as const;

export function StrengthBlock({ chart, locale }: { chart: Chart; locale: AppLocale }) {
  const view = strengthView(chart);
  const track = (pin: number | null, on?: string) => (
    <div className={styles.track} role={pin == null ? undefined : "img"} aria-label={pin == null ? undefined : `신강 지수 ${pin}, ${on}`}>
      <span className={styles.rail} />
      <span className={styles.tick} style={{ "--at": "42%" } as CSSProperties} />
      <span className={styles.tick} style={{ "--at": "58%" } as CSSProperties} />
      {pin != null && <span className={styles.pin} style={{ "--at": `${pin}%` } as CSSProperties} />}
      {zones.map(([name, left]) => (
        <FanText key={name} role={name === on ? "label" : "meta"} className={styles.zone} data-on={name === on || undefined} style={{ "--at": `${left}%` } as CSSProperties}>
          {name}
        </FanText>
      ))}
    </div>
  );
  if (!view)
    return (
      <section className={styles.section}>
        <Head title={<ReadingText id="strengthTitle" />} locked />
        <div className={styles.strength} aria-hidden="true">
          <div className={styles.strengthTop}>
            <i className={styles.faint} data-value="" style={{ width: "2.5rem" }} />
          </div>
          {track(null)}
        </div>
        <FaintRows rows={[["글자 수", 62, 90], ["태어난 달", 48, 92], ["도움 기운", 36, 94], ["부담 기운", 24, 90]]} />
      </section>
    );
  const [count, ...rest] = view.rows;
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="strengthTitle" />} scope={scopeLabel(chart)} />
      <div className={styles.strength}>
        <div className={styles.strengthTop}>
          <FanNumber locale={locale} value={view.index} size="lg" />
          <FanText role="meta">/ 100</FanText>
          <FanTag tone="neutral">{view.class}</FanTag>
          <FanText role="label">{view.label}</FanText>
        </div>
        {track(view.index, view.class)}
      </div>
      <dl className={styles.rows}>
        <div>
          <FanText as="dt" role="meta">
            {count.term}
          </FanText>
          <dd>
            <FanText as="strong" role="item">
              {count.value}
            </FanText>
            <span className={styles.cells} aria-hidden="true">
              {Array.from({ length: view.helpers + view.drainers }, (_, i) => (
                <i key={i} data-on={i < view.helpers || undefined} />
              ))}
            </span>
            <FanText role="meta">{count.plain}</FanText>
          </dd>
        </div>
      </dl>
      <ReadingBasisRows rows={rest} />
    </section>
  );
}

export function TenGodBlock({ chart }: { chart: Chart }) {
  if (!chart.pillars.month)
    return (
      <section className={styles.section}>
        <Head title={<ReadingText id="tenGodTitle" />} locked />
        <div className={styles.tenGods} aria-hidden="true">
          {tenGodGroups.map((group) => (
            <div key={group}>
              <FanText role="label">{group}</FanText>
              <FanText role="meta">{groupPlain[group]}</FanText>
              <i className={styles.faint} data-value="" style={{ width: "3rem" }} />
              <span />
            </div>
          ))}
        </div>
        <FaintRows rows={[["고른 묶음", 58, 88], ["없는 묶음", 20, 94, 44]]} />
      </section>
    );
  const view = tenGodView(chart);
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="tenGodTitle" />} scope={scopeLabel(chart)} />
      <div className={styles.tenGods}>
        {view.groups.map((group) => (
          <div key={group.group} data-zero={group.count === 0 || undefined}>
            <FanText role="label">{group.group}</FanText>
            <FanText role="meta">{group.plain}</FanText>
            <span className={styles.letters}>
              {group.count ? (
                group.letters.map((letter, i) => (
                  <FanHanja role="letters" key={i}>
                    {letter}
                  </FanHanja>
                ))
              ) : (
                <FanText role="meta">없음</FanText>
              )}
            </span>
            <FanText role="label" className={styles.n}>
              {group.count}
            </FanText>
          </div>
        ))}
      </div>
      <ReadingBasisRows rows={view.rows} />
    </section>
  );
}

export function RelationBlock({ chart }: { chart: Chart }) {
  if (!chart.pillars.month)
    return (
      <section className={styles.section}>
        <Head title={<ReadingText id="relationTitle" />} locked />
        <ul className={styles.relations} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} data-row="">
              <span className={styles.spot}>
                {Array.from({ length: 8 }, (_, j) => (
                  <i key={j} />
                ))}
              </span>
              <span className={styles.relationText}>
                <Faint widths={[34, 92, 58]} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  const rows = relationRows(chart);
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="relationTitle" />} scope={scopeLabel(chart)} />
      <ul className={styles.relations}>
        {rows.map((row) => (
          <li key={`${row.kind}:${row.where}`} data-row="">
            <span className={styles.spot} data-rough={row.rough || undefined} aria-hidden="true">
              {(["stem", "branch"] as const).flatMap((place) =>
                pillarKeys.map((key) => {
                  const pillar = chart.pillars[key];
                  const on = place === row.place && row.keys.includes(key) && pillar;
                  return (
                    <FanText role="meta" as="span" key={`${place}${key}`} data-on={on ? "" : undefined}>
                      {on ? (place === "stem" ? stemHanja[pillar.heavenlyStem] : branchHanja[pillar.earthlyBranch]) : null}
                    </FanText>
                  );
                }),
              )}
            </span>
            <span className={styles.relationText}>
              <span className={styles.kind}>
                <FanText role="item">{row.kind}</FanText>
                <FanText role="meta">{row.where}</FanText>
              </span>
              <FanText role="meta">
                <FanText role="label" className={styles.ink}>
                  {row.tag}
                </FanText>{" "}
                · {row.plain}
              </FanText>
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li data-row="">
            <span className={styles.relationText}>
              <FanText role="item">합 · 충 · 형 없음</FanText>
              <FanText role="meta">겉에 드러난 글자끼리 합 · 충 · 형으로 묶이거나 맞서는 자리는 없어요</FanText>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
export function YearFlowBlock({ chart, at }: { chart: Chart; at: number }) {
  const view = yearFlowView(chart, at);
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="yearFlow" />} />
      <div className={styles.chips}>
        <span className={styles.chip} data-me="">
          <FanText role="meta" className={styles.chipLabel}>
            내 일주
          </FanText>
          <FanHanja role="pair">{view.me.hanja}</FanHanja>
          <FanText role="meta">
            {view.me.pillar.heavenlyStem}
            {view.me.pillar.earthlyBranch}
          </FanText>
        </span>
        <FanText role="meta">×</FanText>
        <span className={styles.chip}>
          <FanText role="meta" className={styles.chipLabel}>
            {view.year.label}년
          </FanText>
          <FanHanja role="pair">{view.year.hanja}</FanHanja>
          <FanText role="meta">
            {view.year.pillar.heavenlyStem}
            {view.year.pillar.earthlyBranch}
          </FanText>
        </span>
      </div>
      <ReadingBasisRows rows={view.rows} />
    </section>
  );
}
