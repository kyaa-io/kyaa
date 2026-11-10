import type { CSSProperties } from "react";

import type { AppLocale } from "@/i18n/locales";
import { fanUiText } from "./fan-ui-copy";
import styles from "./fan-skeleton.module.css";

type Length = number | string;
const size = (value: Length | undefined) => (typeof value === "number" ? `${value}px` : value);

/** 로딩 자리의 막대 하나. 150ms 안에 값이 오면 보이지 않는다. 자리는 처음부터 차지한다. */
export function FanSkeleton({ shape = "text", width, height, className }: Readonly<{ shape?: "text" | "block" | "circle"; width?: Length; height?: Length; className?: string }>) {
  return <span aria-hidden="true" className={[styles.bar, styles[shape], className ?? ""].filter(Boolean).join(" ")} style={{ width: size(width), height: size(height) } as CSSProperties} />;
}

/** 화면당 하나 두는 숨은 상태 문구. */
export function FanSkeletonStatus({ locale, label }: Readonly<{ locale: AppLocale; label?: string }>) {
  return <span className={styles.srOnly} role="status">{label ?? fanUiText(locale, "loadingStatus")}</span>;
}

export type FanSkeletonRowsVariant = "post" | "entity" | "member" | "tile" | "plain";

function Row({ variant }: Readonly<{ variant: FanSkeletonRowsVariant }>) {
  if (variant === "post") return <div className={styles.postRow}><FanSkeleton shape="block" className={styles.postThumb} /><div className={styles.postCopy}><FanSkeleton className={styles.postTitle} /><FanSkeleton className={styles.postMeta} /></div></div>;
  if (variant === "entity") return <div className={styles.entityRow}><FanSkeleton shape="block" width={48} height={48} className={styles.entityImage} /><div className={styles.entityCopy}><FanSkeleton width="60%" height={22} /><FanSkeleton width={96} height={22} /></div></div>;
  if (variant === "tile") return <div className={styles.tileRow}><FanSkeleton shape="block" className={styles.tile} /><FanSkeleton width="70%" height={19} /><FanSkeleton width="40%" height={16} /></div>;
  if (variant === "member") return <div className={styles.memberRow}><FanSkeleton shape="circle" width={40} height={40} /><div className={styles.entityCopy}><FanSkeleton width="40%" height={16} /><FanSkeleton width="24%" height={13} /></div></div>;
  return <div className={styles.plainRow}><FanSkeleton width="70%" height={16} /></div>;
}

/** 목록 자리의 골격. 실제 행의 높이와 같고 묶음에 aria-busy를 건다. 비로그인의 내 값 자리에는 쓰지 않는다(FanLockedRows). */
export function FanSkeletonRows({ rows = 5, variant = "plain", className, ariaLabel }: Readonly<{ rows?: number; variant?: FanSkeletonRowsVariant; className?: string; ariaLabel?: string }>) {
  return <div className={[styles.rows, styles[`${variant}Rows`] ?? "", className ?? ""].filter(Boolean).join(" ")} aria-busy="true" aria-label={ariaLabel} role={ariaLabel ? "status" : undefined} data-fan-skeleton={variant}>
    {Array.from({ length: rows }, (_, index) => <Row key={index} variant={variant} />)}
  </div>;
}

export type FanSkeletonPageLayout = "list" | "detail" | "form" | "center";

/** 쪽 전체 자리의 골격. 제목 막대 아래에 화면 형태의 면을 둔다. list=행 목록, detail=큰 면+글줄, form=입력 칸+행동, center=가운데 카드(콜백·전환). 상태 문구는 숨은 role=status 하나. */
export function FanSkeletonPage({ locale, layout = "list", label, className }: Readonly<{ locale: AppLocale; layout?: FanSkeletonPageLayout; label?: string; className?: string }>) {
  return <div className={[styles.page, styles[`${layout}Page`] ?? "", className ?? ""].filter(Boolean).join(" ")} aria-busy="true" data-fan-skeleton-page={layout}>
    <FanSkeletonStatus locale={locale} label={label} />
    <div className={styles.pageBody} aria-hidden="true">
      <FanSkeleton width={layout === "center" ? 160 : "40%"} height={layout === "center" ? 20 : 28} className={styles.pageTitle} />
      {layout === "list" ? <FanSkeletonRows rows={6} variant="post" /> : null}
      {layout === "detail" ? <><FanSkeleton shape="block" height={200} /><FanSkeleton width="80%" height={18} /><FanSkeleton width="60%" height={18} /><FanSkeleton width="70%" height={18} /></> : null}
      {layout === "form" ? <><FanSkeleton shape="block" height={48} /><FanSkeleton shape="block" height={48} /><FanSkeleton shape="block" height={48} /><FanSkeleton shape="block" height={48} className={styles.pageAction} /></> : null}
      {layout === "center" ? <><FanSkeleton width="70%" height={14} /><FanSkeleton shape="block" height={48} /></> : null}
    </div>
  </div>;
}
