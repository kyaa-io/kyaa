export type TarotCharacter = "changha" | "elina" | "yuna" | "dosa";
export type TarotVoice = "ban" | "yo" | "hao";

/** 입장 고르기 띠 순서. 말투는 COM-TX-01(반말 · 요체 · 하오체) 셋이고, 세 최애는 그 위에 자기 대사(TAROT_OWN)를 얹는다. */
export const TAROT_CHARACTERS: readonly { key: TarotCharacter; name: string; voice: TarotVoice }[] = [
  { key: "changha", name: "창하", voice: "ban" },
  { key: "elina", name: "엘리나", voice: "yo" },
  { key: "yuna", name: "유나", voice: "ban" },
  { key: "dosa", name: "kyaa 도사", voice: "hao" },
];

export const isTarotCharacter = (value: string | null | undefined): value is TarotCharacter =>
  TAROT_CHARACTERS.some((character) => character.key === value);

export const tarotCharacter = (key: TarotCharacter) => TAROT_CHARACTERS.find((character) => character.key === key)!;

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
 * 최애마다 다른 대사. 말투 바탕(TAROT_LINES) 위에 얹는다: 창하는 장난스럽게 응원, 엘리나는 다정하게 챙기고(반존대),
 * 유나는 맡아서 읽어 주고 색 고르기에 빗댄다(features/chemi/persona.ts).
 */
const TAROT_OWN: Partial<Record<TarotCharacter, Partial<(typeof TAROT_LINES)[TarotVoice]>>> = {
  changha: {
    shuffle: "천천히 섞을게. 좋은 카드 나오면 내 덕이다? 끌리는 걸로 골라.",
    lock: "좋아, 네가 고른 카드로 간다. 결과는 같이 보자.",
  },
  elina: {
    hello: "왔네. 오늘 카드 한 장 뽑아 볼래요?",
    shuffle: "천천히 섞을게요. 서두르지 말고, 끌리는 게 있으면 그걸로 골라.",
    lock: "좋아요, 고른 카드로 볼게요. 마음 편히 들어요.",
  },
  yuna: {
    hello: "왔네. 오늘 카드, 내가 읽어 줄게.",
    think: "궁금한 거 하나만 정해. 말 안 해도 돼.",
    shuffle: "천천히 섞을게. 고민 길게 하지 말고 끌리는 걸로 골라.",
    lock: "좋아, 네가 고른 카드부터 볼게.",
    drawn: (name, reversed) => `${name} 카드네. ${reversed ? "거꾸로" : "똑바로"} 나왔어.`,
  },
};

/** 뽑는 동안 그 최애가 하는 말. */
export const tarotLines = (character: TarotCharacter) => ({ ...TAROT_LINES[tarotCharacter(character).voice], ...TAROT_OWN[character] });

export const tarotScene = (character: TarotCharacter, wide: boolean) => `/chemi/tarot/scene-${character}-${wide ? "l" : "p"}.webp`;
export const tarotAvatar = (character: TarotCharacter) => `/chemi/tarot/avatar-${character}.jpg`;
export const tarotFaceThumb = (character: TarotCharacter) => `/chemi/tarot/face-${character}.webp`;
