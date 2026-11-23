export type TarotCharacter = "changha" | "elina" | "yuna" | "dosa";
export type TarotVoice = "ban" | "yo" | "hao";
/** 타로 글의 언어. 한국어 밖의 언어는 영어 글을 보여 준다(운영 오픈 점검표 Q4-A: 한국어·영어만 맞추고 나머지 9개 언어는 영어). */
export type TarotLang = "ko" | "en";
export const tarotLang = (locale: string | null | undefined): TarotLang => (locale === "ko" ? "ko" : "en");

/** 입장 고르기 띠 순서. 말투는 COM-TX-01(반말 · 요체 · 하오체) 셋이고, 세 최애는 그 위에 자기 대사(TAROT_OWN)를 얹는다. */
export const TAROT_CHARACTERS: readonly { key: TarotCharacter; name: string; nameEn: string; voice: TarotVoice }[] = [
  { key: "changha", name: "창하", nameEn: "Changha", voice: "ban" },
  { key: "elina", name: "엘리나", nameEn: "Elina", voice: "yo" },
  { key: "yuna", name: "유나", nameEn: "Yuna", voice: "ban" },
  { key: "dosa", name: "kyaa 도사", nameEn: "kyaa Dosa", voice: "hao" },
];

export const isTarotCharacter = (value: string | null | undefined): value is TarotCharacter =>
  TAROT_CHARACTERS.some((character) => character.key === value);

/** 최애 한 명. name 은 화면 언어의 이름이다. */
export const tarotCharacter = (key: TarotCharacter, locale: string = "ko") => {
  const character = TAROT_CHARACTERS.find((item) => item.key === key)!;
  return tarotLang(locale) === "ko" ? character : { ...character, name: character.nameEn };
};

/** 뽑는 동안 최애가 하는 말. 입장·떠올리기·섞기·고르기·확정·이미 뽑은 날. 카드를 읽어 주는 말은 풀이 글(content/chemi/tarot)에 있다. */
export const TAROT_LINES: Record<TarotVoice, { hello: string; again: string; think: string; shuffle: string; pick: string; lock: string; already: string; drawn: (name: string, reversed: boolean) => string }> = {
  ban: {
    hello: "왔네. 오늘 카드 한 장 뽑아 볼래?",
    again: "또 왔네? 오늘 카드는 그대로야.",
    think: "궁금한 거 하나, 마음속으로만 떠올려 봐. 말 안 해도 돼.",
    shuffle: "천천히 섞을게. 끌리는 거 있으면 그걸로 골라.",
    pick: "끌리는 카드에서 멈추면 돼.",
    lock: "좋아, 네가 고른 카드로 볼게.",
    already: "오늘은 이미 이 카드였어.",
    drawn: (name, reversed) => `${name} 카드가 ${reversed ? "거꾸로" : "똑바로"} 나왔어.`,
  },
  yo: {
    hello: "왔네요. 오늘 카드 한 장 뽑아 볼래요?",
    again: "또 왔네요? 오늘 카드는 그대로예요.",
    think: "궁금한 걸 하나, 마음속으로만 떠올려 봐요. 말 안 해도 돼요.",
    shuffle: "천천히 섞을게요. 끌리는 게 있으면 그걸로 골라요.",
    pick: "끌리는 카드에서 멈추면 돼요.",
    lock: "좋아요, 고른 카드로 볼게요.",
    already: "오늘은 이미 이 카드였어요.",
    drawn: (name, reversed) => `${name} 카드가 ${reversed ? "거꾸로" : "똑바로"} 나왔어요.`,
  },
  hao: {
    hello: "왔구려. 오늘 카드 한 장 뽑아 보겠소?",
    again: "또 왔구려. 오늘 카드는 그대로요.",
    think: "궁금한 것 하나를 마음속으로만 떠올려 보시오. 말하지 않아도 되오.",
    shuffle: "천천히 섞겠소. 끌리는 것이 있으면 그것으로 고르시오.",
    pick: "끌리는 카드에서 멈추면 되오.",
    lock: "좋소, 고른 카드로 보겠소.",
    already: "오늘은 이미 이 카드였소.",
    drawn: (name, reversed) => `${name} 카드가 ${reversed ? "거꾸로" : "똑바로"} 나왔소.`,
  },
};

/**
 * 최애마다 다른 대사. 말투 바탕(TAROT_LINES) 위에 얹는다: 창하는 촬영, 엘리나는 노래에 빗대고(반존대),
 * 유나는 맡아서 읽어 주고 색 고르기에 빗댄다(features/chemi/persona.ts).
 */
const TAROT_OWN: Partial<Record<TarotCharacter, Partial<(typeof TAROT_LINES)[TarotVoice]>>> = {
  changha: {
    shuffle: "촬영 전 리허설처럼 천천히 섞을게. 끌리는 거 있으면 그걸로 골라.",
    lock: "좋아, 이 장면은 네가 고른 카드로 갈게.",
  },
  elina: {
    hello: "왔네. 오늘 카드 한 장 뽑아 볼래요?",
    shuffle: "노래 시작 전처럼 천천히 섞을게. 끌리는 게 있으면 그걸로 골라요.",
    lock: "좋아요, 고른 카드로 첫 소절을 열게요.",
  },
  yuna: {
    hello: "왔네. 오늘 카드, 내가 읽어 줄게.",
    think: "궁금한 거 하나만 정해. 말 안 해도 돼.",
    shuffle: "색 고르듯 천천히 섞을게. 끌리는 걸로 골라.",
    lock: "좋아, 네가 고른 카드부터 볼게.",
    drawn: (name, reversed) => `${name} 카드네. ${reversed ? "거꾸로" : "똑바로"} 나왔어.`,
  },
};

/** 영어 화면에서 뽑는 동안 하는 말. 말투 셋(반말 · 요체 · 하오체)을 영어의 친근함 · 부드러움 · 예스러움으로 옮겼다. */
const TAROT_LINES_EN: typeof TAROT_LINES = {
  ban: {
    hello: "You're here. Want to draw a card for today?",
    again: "Back again? Today's card stays the same.",
    think: "Think of one thing you're curious about, just in your head. You don't have to say it.",
    shuffle: "I'll shuffle slowly. If one calls to you, pick that one.",
    pick: "Just stop at the card that calls to you.",
    lock: "Okay, we'll go with the card you picked.",
    already: "Today it was already this card.",
    drawn: (name, reversed) => `${name} came up ${reversed ? "reversed" : "upright"}.`,
  },
  yo: {
    hello: "Oh, you're here. Shall we draw a card for today?",
    again: "You came back? Today's card is still the same.",
    think: "Think of one thing you're curious about, just in your heart. You don't have to say it.",
    shuffle: "I'll shuffle slowly. If one feels right, choose that one.",
    pick: "Just stop at the card that feels right.",
    lock: "Lovely, let's read the card you chose.",
    already: "Today it was already this card.",
    drawn: (name, reversed) => `${name} came up ${reversed ? "reversed" : "upright"}.`,
  },
  hao: {
    hello: "You have come. Will you draw a card for today?",
    again: "You have returned. Today's card remains the same.",
    think: "Hold one question in your mind. You need not speak it.",
    shuffle: "I shall shuffle slowly. Choose the one that calls to you.",
    pick: "Stop at the card that calls to you.",
    lock: "Very well. We shall read the card you chose.",
    already: "Today it was already this card.",
    drawn: (name, reversed) => `${name} has appeared ${reversed ? "reversed" : "upright"}.`,
  },
};

const TAROT_OWN_EN: typeof TAROT_OWN = {
  changha: {
    shuffle: "Slowly, like a rehearsal before a shoot. If one calls to you, pick that one.",
    lock: "Okay, this scene goes with the card you picked.",
  },
  elina: {
    hello: "You're here. Shall we draw a card for today?",
    shuffle: "Slowly, like the moment before a song starts. Choose the one that feels right.",
    lock: "Lovely, your card opens the first verse.",
  },
  yuna: {
    hello: "You're here. I'll read today's card for you.",
    think: "Just pick one question. You don't have to say it.",
    shuffle: "I'll shuffle slowly, like picking a color. Choose the one you're drawn to.",
    lock: "Okay, let's start with the card you picked.",
    drawn: (name, reversed) => `It's ${name}. It came up ${reversed ? "reversed" : "upright"}.`,
  },
};

/** 뽑는 동안 그 최애가 하는 말. */
export const tarotLines = (character: TarotCharacter, locale: string = "ko") =>
  tarotLang(locale) === "ko"
    ? { ...TAROT_LINES[tarotCharacter(character).voice], ...TAROT_OWN[character] }
    : { ...TAROT_LINES_EN[tarotCharacter(character).voice], ...TAROT_OWN_EN[character] };

export const tarotScene = (character: TarotCharacter, wide: boolean) => `/chemi/tarot/scene-${character}-${wide ? "l" : "p"}.webp`;
export const tarotAvatar = (character: TarotCharacter) => `/chemi/tarot/avatar-${character}.jpg`;
export const tarotFaceThumb = (character: TarotCharacter) => `/chemi/tarot/face-${character}.webp`;
