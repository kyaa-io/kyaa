/**
 * 오늘의 운세 대화 줄. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안(04-2)의 말투로 만든 임시 줄이다.
 * 창하는 촬영·대본, 엘리나는 노래·옷, 유나는 화장에 빗대어 말한다(features/chemi/persona.ts).
 * 점수·분야·행운 값만 끼우고, 같은 입력이면 같은 줄이 나온다.
 */
import { chemiPersona, isChemiPersona, type ChemiPersonaId } from "@/features/chemi/persona";

export const fortuneCharacters = [
  { id: "changha", name: "창하" },
  { id: "elina", name: "엘리나" },
  { id: "yuna", name: "유나" },
  { id: "dosa", name: "kyaa 도사" },
] as const;
export type FortuneCharacterId = (typeof fortuneCharacters)[number]["id"];

export type FortuneLineInput = {
  score: number;
  grade: string;
  fandom: number;
  money: number;
  people: number;
  luckyHour: { start: number; end: number } | null;
  color: string;
};

/** 최애마다 글자가 다른 대화 선택지. */
export type FortuneChoice = "tellMore" | "whatFandom" | "whatBring";

type Tone = {
  enter: (who: string) => string;
  birth: (who: string) => string;
  calc: string;
  scoreLine: (score: number, grade: string) => string;
  people: { high: string; low: string };
  fandom: (score: number, high: boolean) => string;
  luck: (hour: string | null, color: string) => string;
  /** 두 번째 선택지로 이야기를 골라 들었을 때 그 선택을 먼저 받아 주는 한마디. */
  picked: { fandom: string; luck: string };
  /** 등급별 한 마디. 세 최애는 자기 활동 분야(features/chemi/persona.ts)에 빗대어 말한다. */
  gradeNotes?: Record<string, string>;
  /** 대화 선택지(팬이 최애에게 하는 말). 없으면 공통 글자(chemi.json)를 쓴다. */
  choice?: Record<FortuneChoice, string>;
};

const tones: Record<FortuneCharacterId, Tone> = {
  changha: {
    enter: (who) => `${who}구름 위까지 올라왔네. 오늘 운세 봐 줄까?`,
    birth: (who) => `${who}운세 보려면 네 생일이 필요해. 한 번만 알려 줘.`,
    calc: "네 생일은 지난번에 들었지. 잠깐, 대본 읽듯이 오늘 하늘 좀 읽어 볼게.",
    picked: { fandom: "영상부터 궁금했구나.", luck: "챙길 것부터 묻네. 좋아." },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이야.`,
    gradeNotes: {
      "쉬어 가는 날": "촬영 없는 날처럼 일정은 하나만 두는 건 어때?",
      "조심하면 괜찮은 날": "대사 치기 전처럼 한 번만 더 보고 움직이면 돼.",
      "무난한 날": "다시 찍을 것 없이 한 번에 넘어가는 날이지.",
      "좋은 날": "리허설 없이 바로 찍어도 되는 날이야.",
      "아주 좋은 날": "첫 촬영에 오케이 나는 날이니까 망설이던 일부터 해 봐.",
    },
    people: {
      high: "선배나 윗사람이 먼저 말 걸 수도 있어. 반갑게 받아 주면 돼.",
      low: "사람들 사이에서는 대사를 줄이는 날이야. 듣는 쪽이 편할 거야.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점. 놓친 영상 몰아 보기 딱이야. 좋았던 장면 하나만 골라 둘래?`
        : `덕질은 ${score}점. 오늘은 짧은 영상 하나만 보자. 긴 건 내일 봐도 돼.`,
    luck: (hour, color) =>
      hour ? `부탁할 거 있으면 ${hour}에 해. ${color}색 소품도 하나 챙기고.` : `${color}색 소품 하나 챙겨.`,
    choice: { tellMore: "좋다, 더 말해 줘", whatFandom: "오늘 영상 봐도 돼?", whatBring: "소품은 뭘 챙겨?" },
  },
  elina: {
    enter: (who) => `${who}구름 위까지 올라왔네요. 오늘 운세 같이 볼까요?`,
    birth: (who) => `${who}운세를 보려면 생일이 필요해요. 한 번만 알려 줘요.`,
    calc: "생일은 기억해요. 잠깐만요, 가사 읽듯이 오늘 하늘을 볼게요.",
    picked: { fandom: "노래가 제일 궁금했군요.", luck: "입을 것부터 볼까요?" },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이에요.`,
    gradeNotes: {
      "쉬어 가는 날": "노래 사이 숨 쉬는 마디처럼 일정은 하나만 둬요.",
      "조심하면 괜찮은 날": "첫 음 내기 전처럼 한 번만 더 고르고 움직여.",
      "무난한 날": "늘 입던 옷처럼 편하게 흘러가는 날이지?",
      "좋은 날": "박자가 잘 맞는 날이라 하던 일이 술술 풀려요.",
      "아주 좋은 날": "첫 소절부터 잘 나오는 날이니까 망설이던 일부터 해 봐요.",
    },
    people: {
      high: "오늘은 선배가 먼저 말을 걸 수도 있어요. 웃으며 받아 줘요.",
      low: "사람 사이에서는 한 박자 쉬고 말해 봐요. 오늘은 듣는 쪽이어도 괜찮아.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점이에요. 좋아하는 노래를 크게 틀어 두기 좋은 날이에요. 같이 흥얼거려도 돼.`
        : `덕질은 ${score}점이에요. 오늘은 한 곡만 천천히 들어요. 나머지는 내일 들어도 괜찮아.`,
    luck: (hour, color) =>
      `${hour ? `부탁은 ${hour}가 좋아요. ` : ""}오늘 옷에 ${color}색을 하나 넣어 봐요.`,
    choice: { tellMore: "좋아, 더 들려줘", whatFandom: "오늘 뭐 들을까?", whatBring: "오늘 뭐 입을까?" },
  },
  yuna: {
    enter: (who) => `${who}오늘 하늘 내가 읽어 줄게.`,
    birth: (who) => `${who}네 생일부터 알려 줘. 한 번만 하면 돼.`,
    calc: "네 생일은 기억해. 피부 톤 보듯이 오늘 하늘을 하나씩 볼게.",
    picked: { fandom: "볼 것부터 묻네. 좋아.", luck: "포인트 색부터 볼게." },
    scoreLine: (score, grade) => `${score}점, ${grade}이야.`,
    gradeNotes: {
      "쉬어 가는 날": "피부 쉬게 두는 날처럼 일정은 하나면 충분해.",
      "조심하면 괜찮은 날": "화장 고치기 전에 거울 보듯 답장은 한 번 더 읽고 보내.",
      "무난한 날": "매일 하던 화장처럼 하던 대로 하면 돼.",
      "좋은 날": "화장이 한 번에 잘 먹는 날이라 하던 일도 술술 풀려.",
      "아주 좋은 날": "포인트 색 하나 더 올려도 되는 날이라 미뤄 둔 일 꺼내기 좋아.",
    },
    people: {
      high: "윗사람이 먼저 말 걸 수 있는 날이야. 반갑게 받아 주면 돼.",
      low: "오늘은 말을 덜어 내는 게 좋아. 듣는 쪽이 편해.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점이야. 영상 보면서 하나 따라 해 보기 좋은 날이야. 마음에 든 건 저장해 둬.`
        : `덕질은 ${score}점이야. 오늘은 하나만 골라서 봐. 고르는 데 1분이면 돼.`,
    luck: (hour, color) =>
      `${hour ? `부탁은 ${hour}에 하면 돼. ` : ""}${color}색은 포인트로 하나만 챙겨.`,
    choice: { tellMore: "응, 더 읽어 줘", whatFandom: "오늘 뭐 볼까?", whatBring: "포인트 색은 뭐야?" },
  },
  dosa: {
    enter: (who) => `${who}구름 위까지 왔구려. 오늘 운세를 보겠소?`,
    birth: (who) => `${who}운세를 보려면 생일을 알아야 하오. 한 번만 알려 주시오.`,
    calc: "그대 생일은 기억하오. 잠시 하늘을 살피리다.",
    picked: { fandom: "덕질부터 묻는구려.", luck: "챙길 것부터 묻는구려." },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이구려.`,
    people: {
      high: "손윗사람이 말을 걸어올 수 있소. 반갑게 맞으시오.",
      low: "사람 앞에서는 말을 아끼시오. 듣는 쪽이 편하오.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점이오. 무대 영상을 즐기되 장바구니는 내일까지 두시오.`
        : `덕질은 ${score}점이오. 오늘은 천천히 즐기시오. 큰 결제는 내일로 미루시오.`,
    luck: (hour, color) =>
      `${hour ? `${hour}가 청하기 좋소. ` : ""}${color}빛 물건도 챙기시오.`,
    gradeNotes: {
      "쉬어 가는 날": "오늘은 걸음을 늦추고 쉬어 가시오.",
      "조심하면 괜찮은 날": "한 번만 더 살피면 무난히 지나갈 것이오.",
      "무난한 날": "큰일 없이 편안히 흘러가겠소.",
      "좋은 날": "하는 일마다 순하게 풀리겠소.",
      "아주 좋은 날": "하고 싶던 일을 오늘 시작해 보시오.",
    },
  },
};

/** 등급별 한 마디. 풀이 표의 headline 이 있으면 그쪽을 쓴다. */
const gradeNotes: Record<string, string> = {
  "쉬어 가는 날": "오늘은 속도를 줄이고 쉬어 가자.",
  "조심하면 괜찮은 날": "한 번만 더 살피면 무난하게 지나갈 거야.",
  "무난한 날": "큰일 없이 편안하게 흘러갈 거야.",
  "좋은 날": "하던 일이 술술 풀릴 거야.",
  "아주 좋은 날": "하고 싶던 일을 오늘 시작해 봐.",
};

function hourText(hour: { start: number; end: number } | null) {
  return hour ? `${hour.start}시에서 ${hour.end}시 사이` : null;
}

/** 결과 화면 '최애의 한마디'에서 가장 높은 분야를 부르는 말. */
const fieldWords = {
  fandom: "덕질",
  people: "사람",
  work: "일·공부",
  rest: "컨디션",
  love: "연애",
  money: "돈",
} as const;
export type FortuneField = keyof typeof fieldWords;

/** 최애가 자기 활동 분야에 빗대어 오늘 가장 높은 분야를 짚는 첫 문장. */
const resultLeads: Record<ChemiPersonaId, (field: string) => string> = {
  changha: (field) => `오늘 대본에서 제일 잘 나오는 장면은 ${field} 쪽이야.`,
  elina: (field) => `오늘 제일 높은 음은 ${field} 쪽에서 나와요.`,
  yuna: (field) => `오늘 화장이 제일 잘 먹는 곳은 ${field} 쪽이야.`,
};

/**
 * 결과 화면의 최애 한마디(2~3문장). 가장 높은 분야 → 오늘 흐름(persona.ts 맺음말) → 행운 시간이나 색.
 * 부탁 이야기는 대화 4쪽과 같은 행운 시간 줄에서만 한다. kyaa 도사는 대화 4쪽 줄을 그대로 쓴다.
 */
export function fortuneResultWords(
  character: FortuneCharacterId,
  input: FortuneLineInput & { best: FortuneField },
) {
  const luck = tones[character].luck(hourText(input.luckyHour), input.color);
  if (!isChemiPersona(character)) return luck;
  const persona = chemiPersona[character];
  const close = input.score >= 70 ? persona.close.good : persona.close.care;
  const last = input.luckyHour ? luck.split(". ")[0] + "." : luck;
  return `${resultLeads[character](fieldWords[input.best])} ${close} ${last}`;
}

export function fortuneEnterLine(
  character: FortuneCharacterId,
  nickname: string | null,
  mode: "enter" | "birth" = "enter",
) {
  const who = nickname
    ? character === "dosa"
      ? `${nickname} 님, `
      : `${nickname}, `
    : "";
  return tones[character][mode](who);
}

/** 한국어 화면에서 최애마다 다른 선택지 글자. 도사와 다른 언어는 null(공통 글자). */
export function fortuneChoiceLabel(character: FortuneCharacterId, key: string) {
  const choice = tones[character].choice;
  return choice && Object.hasOwn(choice, key) ? choice[key as FortuneChoice] : null;
}

export function fortuneCalcLine(character: FortuneCharacterId) {
  return tones[character].calc;
}

export function fortuneTalkLine(
  character: FortuneCharacterId,
  talk: 1 | 2 | 3 | 4,
  input: FortuneLineInput,
  headline?: string | null,
  /** 두 번째 선택지로 고른 이야기. 그 이야기를 들려줄 때 선택을 받아 주는 한마디가 앞에 붙는다. */
  picked?: "fandom" | "luck" | null,
) {
  const tone = tones[character];
  if (talk === 1) {
    const note = tone.gradeNotes?.[input.grade] ?? (headline ? `${headline}.` : gradeNotes[input.grade] ?? "");
    return `${tone.scoreLine(input.score, input.grade)} ${note}`.trim();
  }
  if (talk === 2) return input.people >= 80 ? tone.people.high : tone.people.low;
  if (talk === 3) return `${picked === "fandom" ? `${tone.picked.fandom} ` : ""}${tone.fandom(input.fandom, input.fandom >= 80)}`;
  return `${picked === "luck" ? `${tone.picked.luck} ` : ""}${tone.luck(hourText(input.luckyHour), input.color)}`;
}
