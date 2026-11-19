import "server-only";
import { createHmac, randomInt } from "node:crypto";

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
