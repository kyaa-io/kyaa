import type { CSSProperties, ReactNode } from "react";
import styles from "./fan-print.module.css";

/**
 * 인쇄 소품 아트(응모권·기프트카드·패스포트 펼침·기회 카드). DESIGN.md §2 FanPrint.
 * UI 부품이 아니라 책상 사진(FanPrintDesk) 위에 놓는 그림이다. 글자·숫자는 사진이 아니라 여기서 정확히 찍는다.
 * 폭은 쓰는 쪽이 정하고, 안의 글자·여백은 소품 폭에 비례(cqw)해서 사진처럼 함께 줄어든다.
 * 화면의 정보와 같은 내용을 한 번 더 보여 주는 그림이라 보조 기술에서는 숨기고(`aria-hidden`), 누르는 요소를 넣지 않는다.
 */
const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ");
const inkStamp = (name: FanPrintStampName) => `/images/stamps/ink-v1/${name}.webp`;

export type FanPrintStampName = "attendance" | "daily-checkin" | "first-comment" | "welcome" | "membership" | "share" | "post" | "first-like" | "frame";

export type FanPrintTicketProps = Readonly<{
  /** 응모권 머리글(인쇄 문구). */
  title: string;
  amount: string;
  prize: string;
  winners: string;
  deadlineLabel: string;
  deadline: string;
  serial: string;
  /** 절취 쪽에 세로로 찍는 한 줄. */
  stub: string;
  /** 있으면 응모 도장을 찍는다. */
  stamp?: string;
  className?: string;
}>;

export function FanPrintTicket({ title, amount, prize, winners, deadlineLabel, deadline, serial, stub, stamp, className }: FanPrintTicketProps) {
  return <div className={cx(styles.ticket, className)} aria-hidden="true" data-art="print" data-fan-print="ticket">
    <div className={styles.ticketPaper}>
      <div className={styles.ticketMain}>
        <div className={styles.ticketHead}><i className={styles.wordmark} /><span className={styles.mono}>{title}</span></div>
        <p className={styles.ticketAmount}>{amount}</p>
        <p className={styles.ticketPrize}><span>{prize}</span><span>{winners}</span></p>
        <div className={styles.ticketFoot}>
          <span className={styles.mono}>{deadlineLabel}</span><span className={cx(styles.mono, styles.ticketDeadline)}>{deadline}</span>
        </div>
      </div>
      <div className={styles.ticketStub}>
        <span className={styles.mono}>{serial}</span>
        <span className={styles.ticketStubLine}>{stub}</span>
      </div>
    </div>
    {stamp ? <div className={styles.ticketStamp} data-fan-print-stamp><img data-art="stamp" src={inkStamp("frame")} alt="" width="512" height="512" /><span>{stamp}</span></div> : null}
  </div>;
}

export type FanPrintGiftCardProps = Readonly<{
  label: string;
  amount: string;
  /** 카드 아래쪽 작은 인쇄 줄. */
  note: string;
  /** 같은 카드가 몇 장인지. 뒤에 겹친 장으로 그린다. */
  count?: number;
  /** 카드를 봉투 위에 올려 놓는다(1등 자리). */
  envelope?: boolean;
  /** 재질 사진(없으면 종이 색 면). */
  material?: string;
  /** FanPrintReveal 안에서 몇 번째 묶음으로 들어오는지(0부터). */
  order?: number;
  className?: string;
}>;

export function FanPrintGiftCard({ label, amount, note, count = 1, envelope, material, order, className }: FanPrintGiftCardProps) {
  const under = Math.max(0, Math.min(count, 10) - 1);
  const face = material ? ({ "--fan-print-material": `url(${material})` } as CSSProperties) : undefined;
  return <div className={cx(styles.gift, className)} aria-hidden="true" data-art="print" data-fan-print="gift-card" style={order ? ({ "--o": order } as CSSProperties) : undefined}>
    <div className={styles.giftPile} style={face}>
      {envelope ? <svg className={styles.envelope} viewBox="0 0 100 60" preserveAspectRatio="none"><path d="M0 0 50 34 100 0" fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg> : null}
      {Array.from({ length: under }, (_, i) => <i key={i} className={styles.giftUnder} style={{ "--i": under - i } as CSSProperties} />)}
      <div className={styles.giftFace}>
        <div className={styles.giftHead}><span className={styles.mono}>{label}</span><i className={styles.wordmark} /></div>
        <p className={styles.giftAmount}>{amount}</p>
        <span className={cx(styles.mono, styles.giftNote)}>{note}</span>
      </div>
    </div>
  </div>;
}

export type FanPrintPassportProps = Readonly<{
  title: string;
  caption: string;
  /** 기계 판독 줄처럼 찍는 두 줄. */
  code: readonly [string, string];
  stamps: readonly FanPrintStampName[];
  className?: string;
}>;

export function FanPrintPassport({ title, caption, code, stamps, className }: FanPrintPassportProps) {
  return <div className={cx(styles.passport, className)} aria-hidden="true" data-art="print" data-fan-print="passport">
    <div className={styles.passportBook}>
      <div className={styles.page}>
        <span className={styles.mono}>{title}</span>
        <i className={cx(styles.wordmark, styles.passportMark)} />
        <span className={styles.passportCaption}>{caption}</span>
        <img className={styles.passportSeal} data-art="stamp" src={inkStamp("welcome")} alt="" width="512" height="512" loading="lazy" />
        <p className={cx(styles.mono, styles.passportCode)}><span>{code[0]}</span><span>{code[1]}</span></p>
      </div>
      <div className={styles.page}>
        <div className={styles.stampGrid}>{stamps.map((name, i) => <img key={`${name}-${i}`} data-art="stamp" src={inkStamp(name)} alt="" width="512" height="512" loading="lazy" />)}</div>
      </div>
    </div>
  </div>;
}

export type FanPrintChanceRow = Readonly<{ label: string; stamp: FanPrintStampName; cap: string }>;
export type FanPrintChanceCardProps = Readonly<{
  title: string;
  /** 칸마다 찍힌 값(+1). */
  each: string;
  slots: number;
  rows: readonly FanPrintChanceRow[];
  className?: string;
}>;

/** 하루 기회 카드: 줄마다 도장 칸 n개. 칸은 비어 있는 자리(점선)이고, 어떤 도장이 찍히는지만 옅게 보인다. */
export function FanPrintChanceCard({ title, each, slots, rows, className }: FanPrintChanceCardProps) {
  return <div className={cx(styles.chance, className)} aria-hidden="true" data-art="print" data-fan-print="chance-card">
    <div className={styles.chancePaper}>
      <div className={styles.chanceHead}><i className={styles.wordmark} /><span className={styles.mono}>{title}</span></div>
      {rows.map((row, r) => <div key={row.label} className={styles.chanceRow}>
        <span className={styles.chanceLabel}>{row.label}</span>
        <div className={styles.chanceSlots}>{Array.from({ length: slots }, (_, i) => <span key={i} className={styles.chanceSlot} style={{ "--i": r * slots + i } as CSSProperties}><i><img data-art="stamp" src={inkStamp(row.stamp)} alt="" width="512" height="512" loading="lazy" /></i><b>{each}</b></span>)}</div>
        <span className={cx(styles.mono, styles.chanceCap)}>{row.cap}</span>
      </div>)}
    </div>
  </div>;
}

/** 소품을 올려 두는 사진 면(책상·장면). 자식은 쓰는 쪽에서 자리·기울기를 정한다. */
export function FanPrintDesk({ src, wideSrc, width, height, eager, className, children }: Readonly<{ src: string; wideSrc?: string; width: number; height: number; eager?: boolean; className?: string; children?: ReactNode }>) {
  return <div className={cx(styles.desk, className)} data-fan-print="desk">
    <picture>
      {wideSrc ? <source media="(width >= 64rem)" srcSet={wideSrc} /> : null}
      <img src={src} alt="" width={width} height={height} loading={eager ? undefined : "lazy"} fetchPriority={eager ? "high" : undefined} />
    </picture>
    {children}
  </div>;
}
