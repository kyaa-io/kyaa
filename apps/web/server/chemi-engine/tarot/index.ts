import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const TAROT_SALT_SECRET_NAME = "CHEMI_TAROT_SALT";
export type TarotCard = { card: number; reversed: boolean };
export type TarotInput = {
  userId: string;
  kstDate: string;
  deckVersion: string;
  spread?: string;
  topic?: string;
  position?: number;
  /** Supplied by server/chemi/env.ts from the secret store; never returned. */
  salt: string | undefined;
};

/** Rejection sampling avoids modulo bias for all 78 card positions. */
function stream(seed: Buffer) {
  let counter = 0;
  return (bound: number) => {
    const limit = Math.floor(0x100000000 / bound) * bound;
    for (;;) {
      const value = createHmac("sha256", seed).update(String(counter++)).digest().readUInt32BE(0);
      if (value < limit) return value % bound;
    }
  };
}

/** Pure member calculation: callers own authentication, KST date and persistence. */
export function drawMemberTarot(input: TarotInput, count: 1 | 3 = 1): TarotCard[] {
  if (!input.salt || input.salt.length < 32) throw new Error("CHEMI_CONTENT_OFF");
  if (!input.userId.trim() || !input.deckVersion.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.kstDate) ||
      new Date(`${input.kstDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.kstDate ||
      (count !== 1 && count !== 3)) throw new Error("CHEMI_INVALID_INPUT");
  const position = input.position ?? 0;
  if (!Number.isInteger(position) || position < 0 || position + count > 78) throw new Error("CHEMI_INVALID_INPUT");
  const deckKey = [
    input.userId,
    input.kstDate.replaceAll("-", ""),
    input.deckVersion,
    input.spread ?? (count === 1 ? "daily" : "three"),
    input.topic ?? "",
  ];
  const seed = createHmac("sha256", input.salt).update(JSON.stringify(deckKey)).digest();
  return draw(stream(seed), position + count).slice(position);
}

function draw(next: (bound: number) => number, count: number): TarotCard[] {
  const deck = Array.from({ length: 78 }, (_, i) => i);
  return Array.from({ length: count }, () => {
    const index = next(deck.length);
    const card = deck.splice(index, 1)[0];
    return { card, reversed: next(2) === 1 };
  });
}

/** Guest daily draw has no identity, cookies, cache, DB or other persistence. */
export function drawGuestTarot(): TarotCard {
  return draw(randomInt, 1)[0];
}

/**
 * 비회원이 뽑은 카드의 증표. 기기에는 아무것도 남기지 않고, 로그인으로 돌아오는 주소에만 실려
 * 로그인한 뒤 그날의 첫 카드로 같은 카드를 저장하게 한다. 서버 소금값으로 서명해 카드를 고쳐 쓸 수 없다.
 * 소금값이 없으면 증표를 만들지 않는다(그때는 로그인하면 새로 뽑는다).
 */
export function signGuestTarot(card: TarotCard, kstDate: string, salt: string | undefined): string | null {
  if (!salt || salt.length < 32) return null;
  const body = `${card.card}.${card.reversed ? 1 : 0}.${kstDate.replaceAll("-", "")}`;
  return `${body}.${guestMac(body, salt)}`;
}

/** 증표를 확인해 그날(kstDate)의 카드면 돌려준다. 다른 날 · 고친 값 · 소금값 없음은 null. */
export function readGuestTarot(claim: string | undefined, kstDate: string, salt: string | undefined): TarotCard | null {
  if (!claim || !salt || salt.length < 32) return null;
  const match = /^(\d{1,2})\.([01])\.(\d{8})\.([A-Za-z0-9_-]{43})$/.exec(claim);
  if (!match || match[3] !== kstDate.replaceAll("-", "")) return null;
  const card = Number(match[1]);
  if (card > 77) return null;
  const expected = Buffer.from(guestMac(`${match[1]}.${match[2]}.${match[3]}`, salt));
  const given = Buffer.from(match[4]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { card, reversed: match[2] === "1" };
}

function guestMac(body: string, salt: string) {
  return createHmac("sha256", salt).update(`guest-tarot|${body}`).digest("base64url");
}
