/**
 * 최애 사주 대화 줄. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안 03 의 말투로 만든 임시 줄이다.
 * 창하·유나는 반말, 엘리나는 반존대, kyaa 도사는 하오체(decisions 11/18).
 * 풀이 값(일간 비유·강점·올해 이름)만 끼우고, 같은 입력이면 같은 줄이 나온다.
 */
export const sajuCharacters = [
  { id: "changha", name: "창하" },
  { id: "elina", name: "엘리나" },
  { id: "yuna", name: "유나" },
  { id: "dosa", name: "kyaa 도사" },
] as const;
export type SajuCharacterId = (typeof sajuCharacters)[number]["id"];

export type SajuLineInput = {
  image: string;
  trait: string;
  strengthN: string;
  cautionN: string;
  bond: string;
  yearTitle: string;
};

type Tone = {
  hello: string;
  birth: string;
  calc: string;
  t1: (i: SajuLineInput) => string;
  t2: (i: SajuLineInput) => string;
  t3: (i: SajuLineInput) => string;
  t4: (i: SajuLineInput) => string;
  react: (i: SajuLineInput) => string;
  again: string;
  topics: string;
  thanks: string;
  pairWho: string;
  pairInput: string;
  pairCalc: (name: string) => string;
  pairReact: (line: string) => string;
};

const tones: Record<SajuCharacterId, Tone> = {
  changha: {
    hello: "사주가 궁금한가?",
    birth: "좋아. 언제 태어났는지 알려 줘.",
    calc: "잠깐만, 네 사주 펼쳐 볼게.",
    t1: (i) => `넌 ${i.image} 같은 사람이야. ${i.trait} 사람이지.`,
    t2: (i) => `${i.strengthN}이 네 강점이야. ${i.cautionN}은 조심하고.`,
    t3: (i) => `올해는 ${i.yearTitle}야.`,
    t4: (i) => `너랑 나는 ${i.bond}래.`,
    react: (i) => `${i.image} 같은 사람이라니, 딱 너잖아. 올해 흐름도 볼래?`,
    again: "또 왔네? 오늘은 뭐가 궁금해?",
    topics: "뭐부터 볼까?",
    thanks: "자랑해 줘서 고마워.",
    pairWho: "누구랑 볼까?",
    pairInput: "그 사람 생일 알려 줘. 이름은 별명이면 돼.",
    pairCalc: (name) => `너랑 ${name}, 둘을 나란히 놓고 보는 중이야.`,
    pairReact: (line) => line,
  },
  elina: {
    hello: "사주 보러 왔어요? 같이 볼까?",
    birth: "좋아요. 언제 태어났는지 알려 줄래요?",
    calc: "잠깐만요, 사주를 펼쳐 볼게요.",
    t1: (i) => `${i.image} 같은 사람이에요. ${i.trait} 사람이죠?`,
    t2: (i) => `${i.strengthN}이 강점이에요. ${i.cautionN}은 조심해요.`,
    t3: (i) => `올해는 ${i.yearTitle}예요.`,
    t4: (i) => `우리는 ${i.bond}래요.`,
    react: (i) => `${i.image} 같은 사람이라니, 딱 맞네요. 올해 흐름도 볼래요?`,
    again: "또 왔네요? 오늘은 뭐가 궁금해요?",
    topics: "뭐부터 볼까요?",
    thanks: "자랑해 줘서 고마워요.",
    pairWho: "누구랑 볼까요?",
    pairInput: "그 사람 생일 알려 줘요. 이름은 별명이면 돼요.",
    pairCalc: (name) => `너랑 ${name}, 둘을 나란히 놓고 보는 중이에요.`,
    pairReact: (line) => line.replace("볼래?", "볼래요?"),
  },
  yuna: {
    hello: "사주 궁금해? 내가 봐 줄게.",
    birth: "좋아. 생일부터 알려 줘.",
    calc: "잠깐만. 지금 펼쳐 볼게.",
    t1: (i) => `넌 ${i.image} 같은 사람이야. ${i.trait} 사람이잖아.`,
    t2: (i) => `${i.strengthN}이 네 강점이야. 근데 ${i.cautionN}은 조심해.`,
    t3: (i) => `올해는 ${i.yearTitle}야.`,
    t4: (i) => `우리는 ${i.bond}래.`,
    react: (i) => `${i.image} 같은 사람이라니, 완전 너잖아. 올해 흐름도 볼래?`,
    again: "또 왔네. 오늘은 뭐가 궁금해?",
    topics: "뭐부터 볼까?",
    thanks: "자랑해 줘서 고마워.",
    pairWho: "누구랑 볼까?",
    pairInput: "그 사람 생일 알려 줘. 이름은 별명이면 돼.",
    pairCalc: (name) => `너랑 ${name}, 나란히 놓고 보는 중이야.`,
    pairReact: (line) => line,
  },
  dosa: {
    hello: "사주가 궁금하오?",
    birth: "좋소. 태어난 날을 일러 주시오.",
    calc: "잠시 기다리시오. 사주를 펼치겠소.",
    t1: (i) => `그대는 ${i.image} 같은 사람이오. ${i.trait} 사람이구려.`,
    t2: (i) => `${i.strengthN}이 그대의 강점이오. ${i.cautionN}은 삼가시오.`,
    t3: (i) => `올해는 ${i.yearTitle}요.`,
    t4: (i) => `그대와 나는 ${i.bond}라 하오.`,
    react: (i) => `${i.image} 같은 사람이라, 그대와 꼭 맞소. 올해 흐름도 보겠소?`,
    again: "또 왔구려. 오늘은 무엇이 궁금하오?",
    topics: "무엇부터 보겠소?",
    thanks: "자랑해 주어 고맙소.",
    pairWho: "누구와 보겠소?",
    pairInput: "그 사람의 생일을 일러 주시오. 이름은 별명이면 되오.",
    pairCalc: (name) => `그대와 ${name}, 둘을 나란히 놓고 보는 중이오.`,
    pairReact: (line) => line.replace("볼래?", "보겠소?").replace("네.", "구려."),
  },
};

export const sajuTone = (id: SajuCharacterId) => tones[id];

/** 풀이 대화 1~4. 1·2는 타고난 모습, 3은 올해, 4는 둘 사이. */
export function sajuTalkLine(id: SajuCharacterId, talk: 1 | 2 | 3 | 4, input: SajuLineInput) {
  const tone = tones[id];
  return [tone.t1, tone.t2, tone.t3, tone.t4][talk - 1](input);
}
