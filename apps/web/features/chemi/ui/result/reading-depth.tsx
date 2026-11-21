"use client";

/**
 * 결과 화면의 풀이 근거 줄과 영역별 풀이(사주·운세·별자리·타로 공통).
 * 근거는 용어 · 계산 값 · 쉬운 풀이 한 줄씩, 영역별 풀이는 접어 두고 첫 칸만 펼쳐 둔다.
 */
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
            <FanText as="strong" role="item">
              {row.value}
            </FanText>
            <FanText as="span" role="meta">
              {row.plain}
            </FanText>
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

export function ReadingDomains({ title, items, className }: { title: string; items: readonly ReadingDomainItem[]; className?: string }) {
  if (!items.length) return null;
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
