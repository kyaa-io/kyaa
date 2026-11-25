"use client";

/**
 * 사주 첫 풀이의 전문 블록(시안 CHEMI-G97-N-1122 2회차). 명식표 판 · 타고난 기운 · 타고난 성격 · 신강·신약 ·
 * 십신 분포 · 합·충 · 올해 흐름. 절기 날 + 시간 모름이면 월주를 모르는 네 블록은 같은 줄 이름에 흐린 줄로 잠근다.
 * 1024px부터 두 블록씩 짝지어 두 열, 390은 한 열이다(배치는 result.module.css 의 .cols).
 */
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, Droplet, Flame, Gem, LockKeyhole, Mountain, Sprout } from "@/components/fan-ui/fan-icons";
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
import { branchHanja, elements, elementHanja, elementName, stemHanja, type Chart, type Element } from "./chart";
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
} from "./first";
import { useSajuTx } from "./tx-context";
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
  const tx = useSajuTx();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const termLocked = !chart.pillars.month;
  const detail = sheetDetail(chart, tx);
  const note = termNote(chart, tx);
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
          <PillarSheet
            columns={sheetColumns(chart, tx)}
            label={sheetLabel(chart, tx)}
            open={open}
            unknownLabel={uiText("unlockTime")}
            terms={tx ? { rows: tx.t.row, element: tx.t.element } : undefined}
          />
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
                  {tx ? tx.f("stageTitle") : "12운성"} <FanText role="meta">{tx ? tx.f("stageNote") : "일간이 그 자리에서 갖는 힘"}</FanText>
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
                    {tx ? tx.f("spiritTitle") : "12신살"} <FanText role="meta">{tx ? tx.f("spiritNote") : "연지 기준"}</FanText>
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
                { term: tx ? tx.f("hiddenTerm") : "지장간", value: tx ? tx.f("hiddenNote") : "진한 글자가 본기예요", plain: "" },
                { term: tx ? tx.f("voidTerm") : "공망", value: `${detail.void.hanja} ${detail.void.letters}`.trim(), plain: detail.void.plain },
                { term: tx ? tx.f("basisTerm") : "계산 기준", value: detail.basis[0], plain: detail.basis[1] },
              ]}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function ElementBlock({ chart, locale }: { chart: Chart; locale: AppLocale }) {
  const tx = useSajuTx();
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
        <FaintRows rows={[[tx ? tx.f("topTerm") : "가장 많은 기운", 28, 92, 46], [tx ? tx.f("noneTerm") : "없는 기운", 22, 94, 88]]} />
      </section>
    );
  const view = elementView(chart, tx);
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="energy" />} scope={scopeLabel(chart, tx)} />
      <ElementRows rows={view.rows} locale={locale} />
      <ReadingBasisRows rows={view.summary} />
    </section>
  );
}

export function ElementRows({ rows, locale }: {
  rows: readonly { element: Element; name: string; count: number; percent: number; top: boolean }[];
  locale: AppLocale;
}) {
  const tx = useSajuTx();
  return (
    <div className={styles.elements}>
      {rows.map((row) => (
        <div key={row.element} data-zero={row.count === 0 || undefined}>
          <ElementName element={row.element} />
          <FanNumber locale={locale} value={row.percent} unit="%" />
          <span className={styles.bar} data-top={row.top || undefined} role="img" aria-label={`${row.name} ${row.percent}%`}>
            <i style={{ width: `${row.percent}%` }} />
          </span>
          <FanText role={row.count === 0 ? "label" : "meta"} className={styles.count}>
            {tx ? tx.f("chars", { n: row.count }) : `${row.count}자`}
          </FanText>
        </div>
      ))}
    </div>
  );
}

function ElementName({ element }: { element: Element }) {
  const tx = useSajuTx();
  return (
    <span className={styles.elementName}>
      <FanIcon icon={elementIcon[element]} size={16} />
      <FanText role="meta">{tx ? tx.t.element(element) : elementName[element]}</FanText>
      <FanText role="body" className={styles.ink}>
        <FanHanja role="inline">{elementHanja[element]}</FanHanja>
      </FanText>
    </span>
  );
}

export function NatureBlock({ chart }: { chart: Chart }) {
  const tx = useSajuTx();
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="traits" />} />
      <ReadingBasisRows rows={natureRows(chart, tx)} />
    </section>
  );
}

const zones = [
  ["신약", 21],
  ["중화", 50],
  ["신강", 79],
] as const;

export function StrengthBlock({ chart, locale }: { chart: Chart; locale: AppLocale }) {
  const tx = useSajuTx();
  const view = strengthView(chart, tx);
  const track = (pin: number | null, on?: string) => (
    <div
      className={styles.track}
      role={pin == null ? undefined : "img"}
      aria-label={pin == null ? undefined : tx ? tx.f("strengthAria", { n: pin, class: view?.className ?? "" }) : `신강 지수 ${pin}, ${on}`}
    >
      <span className={styles.rail} />
      <span className={styles.tick} style={{ "--at": "42%" } as CSSProperties} />
      <span className={styles.tick} style={{ "--at": "58%" } as CSSProperties} />
      {pin != null && <span className={styles.pin} style={{ "--at": `${pin}%` } as CSSProperties} />}
      {zones.map(([name, left]) => (
        <FanText key={name} role={name === on ? "label" : "meta"} className={styles.zone} data-on={name === on || undefined} style={{ "--at": `${left}%` } as CSSProperties}>
          {tx ? tx.t.strength(name) : name}
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
        <FaintRows
          rows={
            tx
              ? [[tx.f("countTerm"), 62, 90], [tx.f("bornMonthTerm"), 48, 92], [tx.f("helpTerm"), 36, 94], [tx.f("burdenTerm"), 24, 90]]
              : [["글자 수", 62, 90], ["태어난 달", 48, 92], ["도움 기운", 36, 94], ["부담 기운", 24, 90]]
          }
        />
      </section>
    );
  const [count, ...rest] = view.rows;
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="strengthTitle" />} scope={scopeLabel(chart, tx)} />
      <div className={styles.strength}>
        <div className={styles.strengthTop}>
          <FanNumber locale={locale} value={view.index} size="lg" />
          <FanText role="meta">/ 100</FanText>
          <FanTag tone="neutral">{view.className}</FanTag>
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
  const tx = useSajuTx();
  if (!chart.pillars.month) {
    return (
      <section className={styles.section}>
        <Head title={<ReadingText id="tenGodTitle" />} locked />
      </section>
    );
  }
  const view = tenGodView(chart, tx);
  return (
    <details className={styles.section}>
      <summary className={styles.disclosure}>
        <FanIcon icon={ChevronDown} size={16} className={styles.disclosureIcon} />
        <FanHeading><ReadingText id="tenGodTitle" /></FanHeading>
        <FanText role="meta">{view.groups.map(({ name, count }) => `${name} ${count}`).join(" · ")}</FanText>
      </summary>
      <FanText role="meta">{scopeLabel(chart, tx)}</FanText>
      <div className={styles.tenGods}>
        {view.groups.map((group) => (
          <div key={group.group} data-zero={group.count === 0 || undefined}>
            <FanText role="label">{group.name}</FanText>
            <FanText role="meta">{group.plain}</FanText>
            <span className={styles.letters}>
              {group.count ? (
                group.letters.map((letter, i) => (
                  <FanHanja role="letters" key={i}>
                    {letter}
                  </FanHanja>
                ))
              ) : (
                <FanText role="meta">{tx ? tx.f("none") : "없음"}</FanText>
              )}
            </span>
            <FanText role="label" className={styles.n}>
              {group.count}
            </FanText>
          </div>
        ))}
      </div>
      <ReadingBasisRows rows={view.rows} />
    </details>
  );
}

export function RelationRow({ letters, kind, where, rough, children }: {
  letters: readonly string[];
  kind: string;
  where?: string;
  rough?: boolean;
  children?: ReactNode;
}) {
  return (
    <li data-row="">
      <span className={styles.relationChips} data-rough={rough || undefined} aria-hidden="true">
        {letters.map((letter, index) => (
          <FanHanja role="pair" key={index}>{letter}</FanHanja>
        ))}
      </span>
      <span className={styles.relationText}>
        <span className={styles.kind}>
          <FanText role="item">{kind}</FanText>
          {where && <FanText role="meta">{where}</FanText>}
        </span>
        {children}
      </span>
    </li>
  );
}

export function RelationList({ children }: { children: ReactNode }) {
  return <ul className={styles.relations}>{children}</ul>;
}

export function RelationBlock({ chart }: { chart: Chart }) {
  const tx = useSajuTx();
  if (!chart.pillars.month) {
    return (
      <section className={styles.section}>
        <Head title={<ReadingText id="relationTitle" />} locked />
      </section>
    );
  }
  const rows = relationRows(chart, tx);
  return (
    <details className={styles.section}>
      <summary className={styles.disclosure}>
        <FanIcon icon={ChevronDown} size={16} className={styles.disclosureIcon} />
        <FanHeading><ReadingText id="relationTitle" /></FanHeading>
        <FanText role="meta">
          {rows.length ? [...new Set(rows.map((row) => row.kindName))]
            .map((kind) => `${kind} ${rows.filter((row) => row.kindName === kind).length}`).join(" · ") : tx ? tx.f("noRelations") : "합 · 충 · 형 없음"}
        </FanText>
      </summary>
      <FanText role="meta">{scopeLabel(chart, tx)}</FanText>
      <RelationList>
        {rows.map((row) => (
          <RelationRow
            key={`${row.kind}:${row.where}`}
            kind={row.kindName}
            where={row.where}
            rough={row.rough}
            letters={row.keys.map((key) => {
              const pillar = chart.pillars[key]!;
              return row.place === "stem" ? stemHanja[pillar.heavenlyStem] : branchHanja[pillar.earthlyBranch];
            })}
          >
            <FanText role="meta">
              <FanText role="label" className={styles.ink}>{row.tag}</FanText> · {row.plain}
            </FanText>
          </RelationRow>
        ))}
      </RelationList>
    </details>
  );
}

export function YearFlowBlock({ chart, at }: { chart: Chart; at: number }) {
  const tx = useSajuTx();
  const view = yearFlowView(chart, at, tx);
  return (
    <section className={styles.section}>
      <Head title={<ReadingText id="yearFlow" />} />
      <div className={styles.chips}>
        <span className={styles.chip} data-me="">
          <FanText role="meta" className={styles.chipLabel}>
            {tx ? tx.f("myDayPillar") : "내 일주"}
          </FanText>
          <FanHanja role="pair">{view.me.hanja}</FanHanja>
          {!tx && (
            <FanText role="meta">
              {view.me.pillar.heavenlyStem}
              {view.me.pillar.earthlyBranch}
            </FanText>
          )}
        </span>
        <FanText role="meta">×</FanText>
        <span className={styles.chip}>
          <FanText role="meta" className={styles.chipLabel}>
            {tx ? view.year.label : `${view.year.label}년`}
          </FanText>
          <FanHanja role="pair">{view.year.hanja}</FanHanja>
          {!tx && (
            <FanText role="meta">
              {view.year.pillar.heavenlyStem}
              {view.year.pillar.earthlyBranch}
            </FanText>
          )}
        </span>
      </div>
      <ReadingBasisRows rows={view.rows} />
    </section>
  );
}
