import { FanPrintPhotoInk, type FanPrintPhotoCard, type FanPrintPhotoLine, type FanPrintPhotoStamp } from '@/components/fan-ui/fan-print';
import styles from './raffle.module.css';

/**
 * 키 비주얼 사진(key-visual-tall·wide) 속 빈 카드 세 장(금·하늘·크림)과 꼬리표에 찍는 인쇄.
 * 모서리는 사진 픽셀로 잰 값이다. 사진을 바꾸면 다시 잰다. 실제 인쇄물처럼 언어와 상관없이 같은 글자다.
 */
type Corners = Pick<FanPrintPhotoCard, 'tl' | 'tr' | 'bl'>;
const amount = (text: string, y: number, size: number, x = 70): FanPrintPhotoLine => ({ text, x, y, size });
const mono = (text: string, y: number, size: number): FanPrintPhotoLine => ({ text, x: 70, y, size, type: 'mono' });
const stampLines = ['KYAA', 'RAFFLE'] as const;
const mark = { x: 728, y: 66, width: 202 } as const;

const wide = {
  gold: { tl: [1135, 328], tr: [1415, 62], bl: [1304, 506] },
  blue: { tl: [1218, 323], tr: [1612, 175], bl: [1302, 575] },
  cream: { tl: [1300, 382], tr: [1720, 305], bl: [1348, 638] },
} as const satisfies Record<string, Corners>;
const tall = {
  gold: { tl: [317, 825], tr: [632, 667], bl: [472, 983] },
  blue: { tl: [405, 837], tr: [752, 705], bl: [534, 1032] },
  cream: { tl: [492, 868], tr: [885, 765], bl: [557, 1116] },
} as const satisfies Record<string, Corners>;

const wideCards: FanPrintPhotoCard[] = [
  { ...wide.gold, lines: [amount('US$25', 155, 120)] },
  { ...wide.blue, lines: [amount('US$50', 190, 120)] },
  { ...wide.cream, lines: [mono('GIFT CARD', 112, 40), amount('US$100', 470, 210, 62), mono('KYAA RAFFLE 2026', 560, 32)], mark },
];
// 세로판은 앞 카드 아래가 봉투 속이라 금액을 올리고 아래 줄은 찍지 않는다.
const tallCards: FanPrintPhotoCard[] = [
  { ...tall.gold, lines: [amount('US$25', 150, 105)] },
  { ...tall.blue, lines: [amount('US$50', 175, 110)] },
  { ...tall.cream, lines: [mono('GIFT CARD', 112, 40), amount('US$100', 330, 180, 62)], mark },
];
const wideStamp: FanPrintPhotoStamp = { at: [1113, 618], size: 90, turn: -6, lines: stampLines };
const tallStamp: FanPrintPhotoStamp = { at: [190, 1222], size: 84, turn: -33, lines: stampLines };

export function RaffleKeyPrint() {
  return <>
    <FanPrintPhotoInk className={styles.kvPrintTall} width={1131} height={1391} cards={tallCards} stamp={tallStamp} />
    <FanPrintPhotoInk className={styles.kvPrintWide} width={1920} height={750} cards={wideCards} stamp={wideStamp} />
  </>;
}
