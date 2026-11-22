"use client";

/**
 * 결과 화면의 풀이 근거 줄과 영역별 풀이(사주·운세·별자리·타로 공통).
 * 근거는 용어 · 계산 값 · 쉬운 풀이 한 줄씩, 영역별 풀이는 접어 두고 첫 칸만 펼쳐 둔다.
 */
import { useSyncExternalStore } from "react";
import { FanDisclosure } from "@/components/fan-ui/fan-collapsible";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import styles from "./reading-depth.module.css";

export type ReadingBasisRow = { term: string; value: string; plain: string };

export function ReadingBasisRows({ rows }: { rows: readonly ReadingBasisRow[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map((row) => (
        <div key={`${row.term}:${row.value}`}>
          <FanText as="dt" role="meta">
            {row.term}
          </FanText>
          <dd>
            {row.value && (
              <FanText as="strong" role="item">
                {row.value}
              </FanText>
            )}
            {row.plain && (
              <FanText as="span" role="meta">
                {row.plain}
              </FanText>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** `className`: 놓이는 화면이 구역 순서를 CSS 로 정할 때 그 화면의 구역 클래스를 넘긴다. */
export function ReadingBasis({ title, rows, className }: { title: string; rows: readonly ReadingBasisRow[]; className?: string }) {
  if (!rows.length) return null;
  return (
    <section className={`${styles.section} ${className ?? ""}`} data-reading-basis="">
      <FanHeading>{title}</FanHeading>
      <ReadingBasisRows rows={rows} />
    </section>
  );
}

export type ReadingDomainItem = {
  key: string;
  label: string;
  /** 머리 줄 오른쪽 값(좋음 · 82 · 별 4개). */
  meta?: string;
  /** 이 영역을 읽은 근거 한 줄. */
  basis?: string;
  sentences: readonly string[];
};

const wideQuery = "(min-width: 64rem)";
function subscribeWide(change: () => void) {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const isWide = () => window.matchMedia(wideQuery).matches;

/**
 * `openWide`: 1024px부터 접지 않고 다섯 줄을 모두 펼친다. 이름 바로 옆에 등급·근거·풀이를 붙여 PC 넓은 줄에 빈 띠를 남기지 않는다.
 */
export function ReadingDomains({
  title,
  items,
  className,
  openWide = false,
}: {
  title: string;
  items: readonly ReadingDomainItem[];
  className?: string;
  openWide?: boolean;
}) {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  if (!items.length) return null;
  if (openWide && wide)
    return (
      <section className={`${styles.section} ${className ?? ""}`} data-reading-domains="">
        <FanHeading>{title}</FanHeading>
        <dl className={styles.rows}>
          {items.map((item) => (
            <div key={item.key}>
              <FanText as="dt" role="item" className={styles.ink}>
                {item.label}
              </FanText>
              <dd>
                {item.meta && (
                  <FanText as="strong" role="label">
                    {item.meta}
                  </FanText>
                )}
                {item.basis && <FanText role="meta">{item.basis}</FanText>}
                <FanText as="p" role="body" className={styles.ink}>
                  {item.sentences.join(" ")}
                </FanText>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  return (
    <section className={`${styles.section} ${className ?? ""}`} data-reading-domains="">
      <FanHeading>{title}</FanHeading>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li data-row="" key={item.key}>
            <FanDisclosure label={item.label} meta={item.meta} defaultOpen={index === 0}>
              <div className={styles.more}>
                {item.basis && (
                  <FanText as="p" role="meta" className={styles.basis}>
                    {item.basis}
                  </FanText>
                )}
                <FanText as="p" role="body">
                  {item.sentences.join(" ")}
                </FanText>
              </div>
            </FanDisclosure>
          </li>
        ))}
      </ul>
    </section>
  );
}
