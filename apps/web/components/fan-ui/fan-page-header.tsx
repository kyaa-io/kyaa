"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { AppLocale } from "@/i18n/locales";
import { FanPageImageSlot, fanPageKindLabel, fanPageKindTone, type FanPageImage, type FanPageKind } from "./fan-entity-card";
import { FanSkeleton } from "./fan-skeleton";
import { FanStarAction, type FanStarActionProps } from "./fan-star-action";
import { FanTag } from "./fan-tag";
import { VerifiedMark } from "./verified-mark";
import styles from "./fan-page-header.module.css";

export type FanPageHeaderLink = Readonly<{ kind: string; href: string }>;

const iconOf = (kind: string) => (kind === "chzzk" ? "/images/guest-home/chzzk.png" : `/images/guest-home/${kind}.svg`);

/** Two lines of the introduction, and a toggle only when the text is longer than that. The text is the source's own words. */
function Description({ children, labels, action }: Readonly<{ children: ReactNode; labels?: Readonly<{ more: string; less: string }>; action?: ReactNode }>) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || open || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflow(node.scrollHeight - node.clientHeight > 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, children]);
  return <div className={styles.description}>
    <p ref={ref} className={styles.descriptionText} data-open={open || undefined}>{children}</p>
    {labels && (overflow || open) || action ? <div className={styles.descriptionActions}>
      {labels && (overflow || open) ? <button type="button" className={styles.more} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? labels.less : labels.more}</button> : null}
      {action}
    </div> : null}
  </div>;
}

/**
 * 팬페이지·모임·취미·브랜드가 함께 쓰는 머리(261107-2 U1). 사진이 주인공이다(390 96px, 768+ 128px).
 * 팬페이지는 사진 옆에 이름·SNS와 팬 수·행동을 묶고, 전폭 소개 아래에 방문 통계를 둔다.
 */
export function FanPageHeader({ image, name, kind, fanLayout = kind === "fan", locale, description, descriptionLabels, descriptionAction, star, badge, verified = false, grade, links = [], utility, menu, stats, visits, tabs, frameId }: Readonly<{
  image: FanPageImage;
  name: ReactNode;
  kind: FanPageKind;
  fanLayout?: boolean;
  locale: AppLocale;
  /** 외부 원문은 고치지 않고 그대로 넘긴다. 없으면 줄을 그리지 않는다. */
  description?: ReactNode;
  /** 소개가 2줄을 넘을 때의 펼침 버튼 문구. 없으면 버튼 없이 2줄에서 자른다. */
  descriptionLabels?: Readonly<{ more: string; less: string }>;
  /** 소개 아래 펼침 버튼 옆에 두는 행동(번역된 소개의 원문 보기). 2줄 자르기 밖에 있어 잘리지 않는다. */
  descriptionAction?: ReactNode;
  star?: FanStarActionProps;
  badge?: ReactNode;
  /** kyaa가 등록한 크리에이터·브랜드의 페이지: 이름 바로 뒤에 kyaa official 표시. */
  verified?: boolean;
  /** 이름 옆에 두는 로그인 사용자의 내 팬 등급. 비로그인에서는 넘기지 않는다. */
  grade?: ReactNode;
  links?: readonly FanPageHeaderLink[];
  /** 별 버튼 옆에 두는 행동(팬페이지 좋아요). */
  utility?: ReactNode;
  menu?: ReactNode;
  /** 접속 한 줄. 값을 읽는 동안에도 같은 높이를 유지한다. */
  stats?: ReactNode;
  visits?: ReactNode;
  tabs?: ReactNode;
  /** 탭을 바꿔도 같은 노드로 남는지 검사할 때 쓰는 표식. */
  frameId?: string;
}>) {
  const plainName = typeof name === "string" ? name : "";
  const actions = Boolean(star || utility);
  const linkNav = links.length > 0 ? <nav className={styles.links} aria-label={plainName || undefined}>{links.map((link) => <a key={`${link.kind}:${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.kind} data-platform={link.kind} data-outbound-kind={link.kind === "website" ? "website" : "social"}><img src={iconOf(link.kind)} width={20} height={20} alt="" /></a>)}</nav> : null;
  return <header className={styles.header} data-fan-page-header={kind} data-fan-layout={fanLayout || undefined} data-frame-id={frameId}>
    <div className={styles.identity}>
      <FanPageImageSlot image={image} name={plainName} locale={locale} size={{ mobile: 96, desktop: 128 }} className={styles.image} priority />
      <div className={styles.body}>
      <div className={styles.headline}>
        <div className={styles.titleRow}>
          <h1 className={styles.name}>{name}</h1>
          {verified ? <VerifiedMark className={styles.verified} /> : null}
          {kind === "fan" ? null : <FanTag tone={fanPageKindTone(kind)}>{fanPageKindLabel(locale, kind)}</FanTag>}
          {kind === "fan" ? null : badge}
          {grade}
        </div>
        {menu ? <div className={styles.menu}>{menu}</div> : null}
      </div>
      {linkNav || stats ? <div className={styles.meta}>{linkNav}{stats ? <div className={styles.stats}>{stats}</div> : null}</div> : null}
      {actions ? <div className={styles.actions}>
        {star && <FanStarAction {...star} className={styles.star} />}
        {utility}
      </div> : null}
      </div>
      {description ? <Description labels={descriptionLabels} action={descriptionAction}>{description}</Description> : null}
      {visits}
    </div>
    {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
  </header>;
}

/** 페이지 값을 처음 읽는 동안의 머리. 실제 머리와 같은 칸을 같은 크기로 차지한다. */
export function FanPageHeaderSkeleton({ stats, tabs }: Readonly<{ stats?: ReactNode; tabs?: ReactNode }>) {
  return <header className={styles.header} aria-busy="true" data-fan-page-header="loading">
    <div className={styles.identity}>
      <FanSkeleton shape="block" className={styles.image} />
      <div className={styles.body}>
      <div className={styles.headline}>
        <div className={styles.titleRow}><FanSkeleton className={styles.nameSkeleton} /></div>
      </div>
      {stats ? <div className={styles.meta}><div className={styles.stats}>{stats}</div></div> : null}
      <div className={styles.actions}><FanSkeleton shape="circle" width={96} height={28} className={styles.star} /></div>
      </div>
      <div className={styles.description}><FanSkeleton className={styles.descriptionSkeleton} /></div>
    </div>
    {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
  </header>;
}
