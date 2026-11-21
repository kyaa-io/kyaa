import type { TarotCharacter } from "@/features/chemi/tarot/script";

/** 화면 단계. 주소의 `step` 값과 같다. */
export const TAROT_STEPS = ["enter", "think", "shuffle", "pick", "lock", "flip", "talk2", "talk3", "result"] as const;
export type TarotStep = (typeof TAROT_STEPS)[number];
export const isTarotStep = (value: string | null | undefined): value is TarotStep => TAROT_STEPS.includes(value as TarotStep);

/** 카드를 뽑기 전 화면. 오늘 카드가 이미 있으면 서지 않고 '다시 온 장면'(enter)으로 간다. */
export const BEFORE_DRAW: ReadonlySet<TarotStep> = new Set(["think", "shuffle", "pick", "lock"]);
/** 뽑은 카드가 있어야 그릴 수 있는 화면. */
export const AFTER_DRAW: ReadonlySet<TarotStep> = new Set(["flip", "talk2", "talk3", "result"]);

export type TarotReward = { points?: number; stamp?: boolean; exp?: number; week?: number };

export type TarotDraw = {
  card: number;
  reversed: boolean;
  /** 누른 자리(1~78). 이미 뽑은 날 다시 온 장면에서는 알 수 없다. */
  slot: number | null;
  /** 한국 날짜 YYYY-MM-DD. */
  date: string;
  /** 비회원이 뽑은 카드는 서버에 남지 않는다. */
  readingId: string | null;
  replayed: boolean;
  reward: TarotReward;
  /** 다시 온 장면에서 열었으면 보상을 이 최애 기준으로 한 번 맞춘다. */
  settle: boolean;
};

export type TarotAuth = {
  ready: boolean;
  authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  login: () => void;
};

export const isReadingId = (value: string | undefined): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const kstDate = (now: number = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export const tarotUrl = (params: { locale: string; character: TarotCharacter; step: TarotStep; reading?: string | null }) => {
  const query = new URLSearchParams({ locale: params.locale, c: params.character });
  if (params.step !== "enter") query.set("step", params.step);
  if (params.reading) query.set("r", params.reading);
  return `/chemi/tarot?${query}`;
};

/** 비회원 자랑하기 링크: 서버에 남기지 않고 카드 번호(card)와 방향(rev)만 담는다. */
export const tarotShareUrl = (params: { locale: string; character: TarotCharacter; card: number; reversed: boolean }) => {
  const query = new URLSearchParams({ locale: params.locale, c: params.character, card: String(params.card) });
  if (params.reversed) query.set("rev", "1");
  return `/chemi/tarot?${query}`;
};
