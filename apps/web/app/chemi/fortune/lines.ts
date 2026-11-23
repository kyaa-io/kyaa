/**
 * 오늘의 운세 대화 줄. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안(04-2)의 말투로 만든 임시 줄이다.
 * 최애마다 나를 대하는 태도가 다르다: 창하 장난스러운 응원, 엘리나 다정하게 챙김(반존대), 유나 솔직하게 콕 집음(features/chemi/persona.ts).
 * 점수·분야·행운 값만 끼우고, 같은 입력이면 같은 줄이 나온다.
 */
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
  /** 등급별 한 마디. 세 최애는 자기 태도(features/chemi/persona.ts)대로 말한다. */
  gradeNotes?: Record<string, string>;
  /** 대화 선택지(팬이 최애에게 하는 말). 없으면 공통 글자(chemi.json)를 쓴다. */
  choice?: Record<FortuneChoice, string>;
};

const tones: Record<FortuneCharacterId, Tone> = {
  changha: {
    enter: (who) => `${who}구름 위까지 올라왔네? 오늘 운세 내가 봐 줄게, 기대해.`,
    birth: (who) => `${who}운세 보려면 네 생일이 필요해. 한 번만 알려 줘.`,
    calc: "네 생일은 지난번에 들었지. 잠깐, 오늘 하늘 좀 읽어 볼게. 좋게 나오면 내 덕이다?",
    picked: { fandom: "영상부터 궁금했구나.", luck: "챙길 것부터 묻네. 좋아." },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이야.`,
    gradeNotes: {
      "쉬어 가는 날": "오늘은 쉬엄쉬엄 가자. 약속은 하나만 잡아, 알았지?",
      "조심하면 괜찮은 날": "조심만 하면 괜찮아. 말하기 전에 딱 한 번만 더 생각해.",
      "무난한 날": "평소처럼만 해도 충분히 잘하는 날이야. 알지?",
      "좋은 날": "하던 일이 술술 풀리는 날이야. 오늘은 내가 응원 제대로 해 줄게.",
      "아주 좋은 날": "오늘 같은 날 망설이면 반칙이야. 미뤄 둔 일부터 해 봐.",
    },
    people: {
      high: "선배나 윗사람이 먼저 말 걸 수도 있어. 반갑게 받아 주면 돼.",
      low: "사람들 사이에서는 말 줄이는 날이야. 듣는 쪽이 편할 거야.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점. 놓친 영상 몰아 보기 딱이야. 좋았던 장면 하나만 골라 둘래?`
        : `덕질은 ${score}점. 오늘은 짧은 영상 하나만 보자. 긴 건 내일 봐도 돼.`,
    luck: (hour, color) =>
      hour ? `부탁할 거 있으면 ${hour}에 해. ${color}색 물건도 하나 챙기고, 그럼 오늘은 네 편이야.` : `${color}색 물건 하나 챙겨. 그럼 오늘은 네 편이야.`,
    choice: { tellMore: "좋다, 더 말해 줘", whatFandom: "오늘 영상 봐도 돼?", whatBring: "오늘 뭐 챙겨?" },
  },
  elina: {
    enter: (who) => `${who}여기까지 오느라 힘들었죠? 오늘 운세 같이 봐요.`,
    birth: (who) => `${who}운세를 보려면 생일이 필요해요. 한 번만 알려 줘요.`,
    calc: "생일은 기억해요. 잠깐만요, 오늘 하늘 천천히 볼게요.",
    picked: { fandom: "덕질 얘기부터 궁금했군요.", luck: "챙길 것부터 볼까요?" },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이에요.`,
    gradeNotes: {
      "쉬어 가는 날": "오늘은 무리하지 말아요. 약속은 하나만, 따뜻한 거 마시면서 쉬어.",
      "조심하면 괜찮은 날": "조심하면 괜찮은 날이에요. 말하기 전에 한 번만 더 생각해 봐, 응?",
      "무난한 날": "편하게 흘러가는 날이에요. 밥 잘 챙겨 먹고 하던 대로 해요.",
      "좋은 날": "하던 일이 술술 풀리는 날이에요. 오늘은 마음 편히 가도 돼.",
      "아주 좋은 날": "망설이던 일 있으면 오늘 해 봐요. 내가 옆에서 응원할게.",
    },
    people: {
      high: "오늘은 선배가 먼저 말을 걸 수도 있어요. 웃으며 받아 줘요.",
      low: "사람 사이에서는 한 박자 쉬고 말해 봐요. 오늘은 듣는 쪽이어도 괜찮아.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점이에요. 보고 싶던 거 몰아 봐도 되는 날이에요. 물 한 잔 옆에 두고 봐.`
        : `덕질은 ${score}점이에요. 오늘은 하나만 천천히 봐요. 나머지는 내일 봐도 괜찮아.`,
    luck: (hour, color) =>
      `${hour ? `부탁은 ${hour}가 좋아요. ` : ""}${color}색 물건 하나 챙겨요. 잊지 말고, 알았지?`,
    choice: { tellMore: "좋아, 더 들려줘", whatFandom: "덕질은 뭐 할까?", whatBring: "뭐 챙길까?" },
  },
  yuna: {
    enter: (who) => `${who}오늘 운세, 돌려 말 안 하고 읽어 줄게.`,
    birth: (who) => `${who}네 생일부터 알려 줘. 한 번만 하면 돼.`,
    calc: "네 생일은 기억해. 오늘 하늘 하나씩 짚어 볼게.",
    picked: { fandom: "볼 것부터 묻네. 좋아.", luck: "챙길 것부터 볼게." },
    scoreLine: (score, grade) => `${score}점, ${grade}이야.`,
    gradeNotes: {
      "쉬어 가는 날": "오늘은 쉬는 게 맞아. 약속은 하나면 충분해.",
      "조심하면 괜찮은 날": "답장은 한 번 더 읽고 보내. 오늘 실수는 거기서 나와.",
      "무난한 날": "특별한 건 없어. 하던 대로 하면 돼.",
      "좋은 날": "하던 일이 잘 풀리는 날이야. 미루던 거 지금 해.",
      "아주 좋은 날": "미뤄 둔 일 꺼내기 딱 좋은 날이야. 하나만 골라서 끝내.",
    },
    people: {
      high: "윗사람이 먼저 말 걸 수 있는 날이야. 반갑게 받아 주면 돼.",
      low: "오늘은 말을 덜어 내는 게 좋아. 듣는 쪽이 편해.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점이야. 보고 싶던 거 미루지 말고 오늘 봐. 마음에 든 건 저장해 둬.`
        : `덕질은 ${score}점이야. 오늘은 하나만 골라서 봐. 고르는 데 1분이면 돼.`,
    luck: (hour, color) =>
      `${hour ? `부탁은 ${hour}에 하면 돼. ` : ""}${color}색 물건 딱 하나만 챙겨. 많으면 소용없어.`,
    choice: { tellMore: "응, 더 읽어 줘", whatFandom: "오늘 뭐 볼까?", whatBring: "뭐 챙길까?" },
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
