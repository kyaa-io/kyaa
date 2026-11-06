"use client";
import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/locales";
import { FanPageImageSlot, fanPageKindLabel, fanPageKindTone, type FanPageImage, type FanPageKind } from "./fan-entity-card";
import { FanSkeleton } from "./fan-skeleton";
import { FanStarAction, type FanStarActionProps } from "./fan-star-action";
import { FanTag } from "./fan-tag";
import styles from "./fan-page-header.module.css";

export type FanPageHeaderLink = Readonly<{ kind: string; href: string }>;

const iconOf = (kind: string) => (kind === "chzzk" ? "/images/guest-home/chzzk.png" : `/images/guest-home/${kind}.svg`);

/** 팬페이지·모임·취미·브랜드가 함께 쓰는 머리. 글자 줄은 최대 2줄이다: 이름 + 유형 태그 + 별, 소개. */
export function FanPageHeader({ image, name, kind, locale, description, star, badge, links = [], utility, menu, stats, tabs, frameId }: Readonly<{
  image: FanPageImage;
  name: ReactNode;
  kind: FanPageKind;
  locale: AppLocale;
  /** 외부 원문은 고치지 않고 그대로 넘긴다. */
  description?: ReactNode;
  star?: FanStarActionProps;
  badge?: ReactNode;
  links?: readonly FanPageHeaderLink[];
  /** SNS 앞에 두는 로그인 사용자의 내 값(팬 등급). 비로그인에서는 넘기지 않는다. */
  utility?: ReactNode;
  menu?: ReactNode;
  /** 접속 띠 자리. 값을 읽는 동안에도 같은 높이를 유지한다. */
  stats?: ReactNode;
  tabs?: ReactNode;
  /** 탭을 바꿔도 같은 노드로 남는지 검사할 때 쓰는 표식. */
  frameId?: string;
}>) {
  const plainName = typeof name === "string" ? name : "";
  const right = links.length > 0 || utility || menu;
  return <header className={styles.header} data-fan-page-header={kind} data-frame-id={frameId}>
    <div className={styles.identity}>
      <FanPageImageSlot image={image} name={plainName} locale={locale} size={{ mobile: 56, desktop: 64 }} className={styles.image} />
      <div className={styles.titleRow}>
        <h1 className={styles.name}>{name}</h1>
        <FanTag tone={fanPageKindTone(kind)}>{fanPageKindLabel(locale, kind)}</FanTag>
        {badge}
        {star && <FanStarAction {...star} className={styles.star} />}
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}
      {right ? <div className={styles.right}>
        {utility}
        {links.length > 0 && <nav className={styles.links} aria-label={plainName || undefined}>{links.map((link) => <a key={link.kind} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.kind} data-platform={link.kind} data-outbound-kind="social"><img src={iconOf(link.kind)} width={24} height={24} alt="" /></a>)}</nav>}
        {menu ? <div className={styles.menu}>{menu}</div> : null}
      </div> : null}
    </div>
    {stats ? <div className={styles.stats}>{stats}</div> : null}
    {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
  </header>;
}

/** 페이지 값을 처음 읽는 동안의 머리. 실제 머리와 같은 칸을 같은 크기로 차지한다. */
export function FanPageHeaderSkeleton({ stats, tabs }: Readonly<{ stats?: ReactNode; tabs?: ReactNode }>) {
  return <header className={styles.header} aria-busy="true" data-fan-page-header="loading">
    <div className={styles.identity}>
      <FanSkeleton shape="block" className={styles.image} />
      <div className={styles.titleRow}><FanSkeleton className={styles.nameSkeleton} /><FanSkeleton shape="circle" width={96} height={36} className={styles.star} /></div>
      <FanSkeleton className={styles.descriptionSkeleton} />
    </div>
    {stats ? <div className={styles.stats}>{stats}</div> : null}
    {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
  </header>;
}
