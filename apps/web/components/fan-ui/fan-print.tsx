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
      {Array.from({ length: under }, (_, i) => <i key={i} className={styles.giftUnder} data-fan-print-part="under" style={{ "--i": under - i } as CSSProperties} />)}
      <div className={styles.giftFace} data-fan-print-part="face">
        <div className={styles.giftHead}><span className={styles.mono} data-fan-print-part="ink">{label}</span><i className={styles.wordmark} data-fan-print-part="mark" /></div>
        <p className={styles.giftAmount} data-fan-print-part="ink">{amount}</p>
        <span className={cx(styles.mono, styles.giftNote)} data-fan-print-part="ink">{note}</span>
      </div>
    </div>
  </div>;
}

/** 잉크 도장 한 번(응모 완료 같은 결과가 난 자리에 찍는다). 크기·자리·기울기는 쓰는 쪽이 정하고, 나타날 때 한 번 내려앉는다. */
export function FanPrintStamp({ label, className }: Readonly<{ label: string; className?: string }>) {
  return <div className={cx(styles.stamp, className)} aria-hidden="true" data-art="print" data-fan-print="stamp"><img data-art="stamp" src={inkStamp("frame")} alt="" width="512" height="512" /><span>{label}</span></div>;
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

type FanPrintPoint = readonly [number, number];
/** 사진 속 카드 한 장에 찍는 글자. 좌표는 카드 면(가로 1000 × 세로 630, 기프트카드 비율) 기준. */
export type FanPrintPhotoLine = Readonly<{ text: string; x: number; y: number; size: number; type?: "amount" | "mono" }>;
/** 사진 속 카드: 사진 픽셀로 잰 세 모서리(왼쪽 위·오른쪽 위·왼쪽 아래) + 찍을 글자. 가려진 모서리는 보이는 변의 연장으로 잡는다. */
export type FanPrintPhotoCard = Readonly<{ tl: FanPrintPoint; tr: FanPrintPoint; bl: FanPrintPoint; lines: readonly FanPrintPhotoLine[]; mark?: Readonly<{ x: number; y: number; width: number }> }>;
export type FanPrintPhotoStamp = Readonly<{ at: FanPrintPoint; size: number; turn: number; lines: readonly [string, string] }>;
const CARD_W = 1000;
const CARD_H = 630;
const onCard = ({ tl, tr, bl }: FanPrintPhotoCard) => `matrix(${(tr[0] - tl[0]) / CARD_W} ${(tr[1] - tl[1]) / CARD_W} ${(bl[0] - tl[0]) / CARD_H} ${(bl[1] - tl[1]) / CARD_H} ${tl[0]} ${tl[1]})`;

/**
 * 책상 사진(FanPrintDesk) 속 빈 카드·꼬리표에 인쇄를 찍는다. viewBox가 사진 픽셀이고 slice가 object-fit: cover 가운데와 같아서
 * 사진이 어떻게 잘려도 카드 자리에 붙어 있다. 잉크는 종이 결이 비치게 곱하기. FanPrintDesk의 자식으로 둔다.
 */
export function FanPrintPhotoInk({ width, height, cards, stamp, className }: Readonly<{ width: number; height: number; cards: readonly FanPrintPhotoCard[]; stamp?: FanPrintPhotoStamp; className?: string }>) {
  return <svg className={cx(styles.photoInk, className)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-art="print" data-fan-print="photo-ink">
    <g className={styles.photoInkCards}>{cards.map((card, i) => <g key={i} transform={onCard(card)}>
      {card.lines.map(line => <text key={line.text} className={line.type === "mono" ? styles.mono : styles.photoAmount} x={line.x} y={line.y} fontSize={line.size}>{line.text}</text>)}
      {card.mark ? <image className={styles.photoMark} href="/images/guest-home/kyaa-wordmark.svg" x={card.mark.x} y={card.mark.y} width={card.mark.width} height={card.mark.width * 563 / 1164} /> : null}
    </g>)}</g>
    {stamp ? <g className={styles.photoStamp} transform={`translate(${stamp.at[0]} ${stamp.at[1]}) rotate(${stamp.turn})`}>
      <image href={inkStamp("frame")} x={-stamp.size / 2} y={-stamp.size / 2} width={stamp.size} height={stamp.size} />
      <text x="0" y={-stamp.size * .02} fontSize={stamp.size * .17} textAnchor="middle">{stamp.lines[0]}</text>
      <text x="0" y={stamp.size * .16} fontSize={stamp.size * .12} textAnchor="middle">{stamp.lines[1]}</text>
    </g> : null}
  </svg>;
}

/** 소품을 올려 두는 사진 면(책상·장면). 자식은 쓰는 쪽에서 자리·기울기를 정한다. */
export function FanPrintDesk({ src, wideSrc, wideFrom = "64rem", width, height, eager, className, children }: Readonly<{ src: string; wideSrc?: string; /** wideSrc로 바뀌는 폭(기본 64rem). */ wideFrom?: "48rem" | "64rem"; width: number; height: number; eager?: boolean; className?: string; children?: ReactNode }>) {
  return <div className={cx(styles.desk, className)} data-fan-print="desk">
    <picture>
      {wideSrc ? <source media={`(width >= ${wideFrom})`} srcSet={wideSrc} /> : null}
      <img src={src} alt="" width={width} height={height} loading={eager ? undefined : "lazy"} fetchPriority={eager ? "high" : undefined} />
    </picture>
    {children}
  </div>;
}
