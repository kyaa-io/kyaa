import type { AppLocale } from "@/i18n/locales";
import { creatorName } from "@/features/fanpage/domain/creator-names";
export type TarotCharacter = "changha" | "elina" | "yuna" | "dosa";
export type TarotVoice = "ban" | "yo" | "hao";
/** 타로 글의 언어. 한국어·영어·몽골어는 각자의 글, 그 밖의 언어는 영어 글을 보여 준다(운영 오픈 점검표 Q4-A, 몽골어는 케미 97 9회차). */
export type TarotLang = "ko" | "en" | "mn";
export const tarotLang = (locale: string | null | undefined): TarotLang => (locale === "ko" || locale === "mn" ? locale : "en");

/** 입장 고르기 띠 순서. 말투는 COM-TX-01(반말 · 요체 · 하오체) 셋이고, 세 최애는 그 위에 자기 대사(TAROT_OWN)를 얹는다. */
export const TAROT_CHARACTERS: readonly { key: TarotCharacter; name: string; voice: TarotVoice }[] = [
  { key: "changha", name: "창하", voice: "ban" },
  { key: "elina", name: "엘리나", voice: "yo" },
  { key: "yuna", name: "유나", voice: "ban" },
  { key: "dosa", name: "kyaa 도사", voice: "hao" },
];

export const isTarotCharacter = (value: string | null | undefined): value is TarotCharacter =>
  TAROT_CHARACTERS.some((character) => character.key === value);

/** 최애 한 명. name 은 화면 언어의 이름이다(creatorName: 일본어·태국어·러시아어는 음역, 그 밖 라틴 표기, ko 는 한국어). 말투(voice)만 볼 때는 locale 을 생략한다. */
export const tarotCharacter = (key: TarotCharacter, locale: string = "ko") => {
  const character = TAROT_CHARACTERS.find((item) => item.key === key)!;
  return locale === "ko" ? character : { ...character, name: creatorName(key, locale as AppLocale) };
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

/** 몽골어 화면에서 뽑는 동안 하는 말. 반말은 «чи» 쪽의 가벼운 말, 요체는 «та» 쪽의 부드러운 말, 하오체는 예스러운 명령형(-гтун)으로 옮겼다. */
const TAROT_LINES_MN: typeof TAROT_LINES = {
  ban: {
    hello: "Ирчихлээ. Өнөөдөр нэг хөзөр сугалах уу?",
    again: "Дахиад ирчихэв үү? Өнөөдрийн хөзөр хэвээрээ.",
    think: "Сонирхсон нэг зүйлээ зөвхөн дотроо бодоорой. Хэлэх шаардлагагүй.",
    shuffle: "Аажуухан холино. Татагдсан нь байвал тэрийг сонго.",
    pick: "Татагдсан хөзөр дээрээ зогсоход л болно.",
    lock: "За, чиний сонгосон хөзрөөр харъя.",
    already: "Өнөөдөр аль хэдийн энэ хөзөр буусан.",
    drawn: (name, reversed) => `${name} хөзөр ${reversed ? "урвуу" : "цэх"} буулаа.`,
  },
  yo: {
    hello: "Ирсэн байна уу. Өнөөдөр нэг хөзөр сугалах уу?",
    again: "Дахин ирсэн үү? Өнөөдрийн хөзөр хэвээрээ байна.",
    think: "Сонирхсон нэг зүйлээ зөвхөн сэтгэлдээ бодоорой. Хэлэх шаардлагагүй.",
    shuffle: "Аажуухан холиё. Сэтгэлд нийцсэн нь байвал тэрийг сонгоорой.",
    pick: "Сэтгэлд нийцсэн хөзөр дээрээ зогсоход л болно.",
    lock: "Сайхан байна, сонгосон хөзрөө уншъя.",
    already: "Өнөөдөр аль хэдийн энэ хөзөр буусан.",
    drawn: (name, reversed) => `${name} хөзөр ${reversed ? "урвуу" : "цэх"} буулаа.`,
  },
  hao: {
    hello: "Ирэв үү. Өнөөдөр нэгэн хөзөр сугалах уу?",
    again: "Дахин ирэв. Өнөөдрийн хөзөр хэвээр буй.",
    think: "Нэгэн асуултаа сэтгэлдээ барьтугай. Өгүүлэх хэрэггүй.",
    shuffle: "Аажмаар холиё. Дуудах тэр нэгийг сонгогтун.",
    pick: "Дуудах хөзөр дээрээ зогсогтун.",
    lock: "Сайн. Сонгосон хөзрийг уншъя.",
    already: "Өнөөдөр аль хэдийн энэ хөзөр буусан.",
    drawn: (name, reversed) => `${name} хөзөр ${reversed ? "урвуу" : "цэх"} бууж ирэв.`,
  },
};

const TAROT_OWN_MN: typeof TAROT_OWN = {
  changha: {
    shuffle: "Зураг авалтын өмнөх бэлтгэл шиг аажуухан. Татагдсан нь байвал тэрийг сонго.",
    lock: "За, энэ үзэгдэл чиний сонгосон хөзрөөр явна.",
  },
  elina: {
    hello: "Ирчихлээ. Өнөөдөр нэг хөзөр сугалах уу?",
    shuffle: "Дуу эхлэхийн өмнөх мөч шиг аажуухан. Сэтгэлд нийцсэнээ сонгоорой.",
    lock: "Сайхан байна, таны хөзөр эхний бадгийг нээнэ.",
  },
  yuna: {
    hello: "Ирчихлээ. Өнөөдрийн хөзрийг би уншиж өгье.",
    think: "Ганц асуулт л сонго. Хэлэх шаардлагагүй.",
    shuffle: "Өнгө сонгох шиг аажуухан холино. Татагдсанаа сонго.",
    lock: "За, чиний сонгосон хөзрөөс эхэлье.",
    drawn: (name, reversed) => `${name} байна. ${reversed ? "Урвуу" : "Цэх"} буулаа.`,
  },
};

/** 뽑는 동안 그 최애가 하는 말. */
export const tarotLines = (character: TarotCharacter, locale: string = "ko") => {
  const lang = tarotLang(locale);
  const [lines, own] = lang === "ko" ? [TAROT_LINES, TAROT_OWN] : lang === "mn" ? [TAROT_LINES_MN, TAROT_OWN_MN] : [TAROT_LINES_EN, TAROT_OWN_EN];
  return { ...lines[tarotCharacter(character).voice], ...own[character] };
};

export const tarotScene = (character: TarotCharacter, wide: boolean) => `/chemi/tarot/scene-${character}-${wide ? "l" : "p"}.webp`;
export const tarotAvatar = (character: TarotCharacter) => `/chemi/tarot/avatar-${character}.jpg`;
export const tarotFaceThumb = (character: TarotCharacter) => `/chemi/tarot/face-${character}.webp`;
