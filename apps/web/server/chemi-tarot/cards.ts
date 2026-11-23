import "server-only";
import cards from "@/content/chemi/tarot/cards.json";
import cardsEn from "@/content/chemi/tarot/cards.en.json";

export type TarotVoice = "ban" | "yo" | "hao";
export type TarotDirection = {
  lead: string;
  rows: readonly (readonly [string, string])[];
  pair: string;
  share: string;
  talk: Record<TarotVoice, readonly [string, string]>;
  react: Record<TarotVoice, string>;
};
export type TarotCardContent = {
  id: number;
  num: string;
  name: string;
  up: string;
  down: string;
  symbol: string;
  alt: string;
  dir: { up: TarotDirection; down: TarotDirection };
};

const deck = cards as unknown as readonly TarotCardContent[];
const deckEn = cardsEn as unknown as readonly TarotCardContent[];
export const TAROT_DECK_SIZE = 78;

/**
 * 덱 번호(0~77)의 풀이 글. 번호는 server/chemi-engine/tarot 의 card 와 같은 순서다.
 * 한국어가 아닌 화면은 영어 글(cards.en.json)을 준다(운영 오픈 점검표 Q4-A).
 */
export function tarotCardContent(id: number, locale: string = "ko"): TarotCardContent | null {
  if (!Number.isInteger(id) || id < 0 || id >= TAROT_DECK_SIZE) return null;
  return (locale === "ko" ? deck : deckEn)[id];
}
