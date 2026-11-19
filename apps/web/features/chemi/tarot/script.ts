export type TarotCharacter = "changha" | "elina" | "yuna" | "dosa";
export type TarotVoice = "ban" | "yo" | "hao";

/** 입장 고르기 띠 순서. 말투는 COM-TX-01(반말 · 요체 · 하오체) 셋이고 창하·유나는 같은 반말 글을 쓴다. */
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

export const tarotScene = (character: TarotCharacter, wide: boolean) => `/chemi/tarot/scene-${character}-${wide ? "l" : "p"}.webp`;
export const tarotAvatar = (character: TarotCharacter) => `/chemi/tarot/avatar-${character}.jpg`;
export const tarotFaceThumb = (character: TarotCharacter) => `/chemi/tarot/face-${character}.webp`;
