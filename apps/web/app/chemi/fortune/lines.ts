/**
 * 오늘의 운세 대화 줄. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안(04-2)의 말투로 만든 임시 줄이다.
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
  /** 등급별 한 마디를 이 말투로 따로 둔 최애(없으면 공통 반말 줄). */
  gradeNotes?: Record<string, string>;
};

const tones: Record<FortuneCharacterId, Tone> = {
  changha: {
    enter: (who) => `${who}구름 위까지 올라왔네. 오늘 운세 봐 줄까?`,
    birth: (who) => `${who}운세 보려면 네 생일이 필요해. 한 번만 알려 줘.`,
    calc: "네 생일은 지난번에 들었지. 잠깐, 오늘 하늘 좀 읽어 볼게.",
    picked: { fandom: "덕질부터 궁금했구나.", luck: "챙길 것부터 묻네. 좋아." },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이야.`,
    people: {
      high: "선배나 윗사람이 먼저 말 걸 수도 있어. 미뤄 둔 부탁 있으면 오늘 꺼내 봐.",
      low: "사람들 사이에서는 말을 조금 아껴 봐. 급한 부탁은 내일로 미뤄도 돼.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점. 혼자 무대 영상 몰아 보기 딱이야. 대신 장바구니는 하루만 참자.`
        : `덕질은 ${score}점. 오늘은 느긋하게 즐기자. 큰 결제는 내일로 미뤄 두고.`,
    luck: (hour, color) =>
      `${hour ? `부탁할 거 있으면 ${hour}에 해. ` : ""}${color}색 물건도 하나 챙기고.`,
  },
  elina: {
    enter: (who) => `${who}구름 위까지 올라왔네요. 오늘 운세 같이 볼까요?`,
    birth: (who) => `${who}운세를 보려면 생일이 필요해요. 한 번만 알려 줘요.`,
    calc: "생일은 기억해요. 잠깐만요, 오늘 하늘을 볼게요.",
    picked: { fandom: "덕질이 제일 궁금했군요.", luck: "챙길 것부터 볼까요?" },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이에요.`,
    gradeNotes: {
      "쉬어 가는 날": "오늘은 조금 쉬어 가요.",
      "조심하면 괜찮은 날": "한 번 더 살피면 무난히 지나갈 거예요.",
      "무난한 날": "큰일 없이 편안하게 흘러갈 거예요.",
      "좋은 날": "누군가 먼저 손을 내밀지도 몰라요.",
      "아주 좋은 날": "하고 싶던 일을 오늘 시작해 봐요.",
    },
    people: {
      high: "미뤄 둔 부탁이 있나요? 오늘 선배가 말을 걸면 꺼내 봐요.",
      low: "사람 사이에서는 말을 아껴 봐요. 급한 부탁은 내일로 미뤄도 괜찮아요.",
    },
    fandom: (score, high) =>
      high
        ? `덕질은 ${score}점이에요. 오늘은 무대 영상을 보고, 장바구니는 내일 열까요?`
        : `덕질은 ${score}점이에요. 오늘은 천천히 즐겨요. 큰 결제는 내일로 미뤄요.`,
    luck: (hour, color) =>
      `${hour ? `부탁은 ${hour}가 좋아요. ` : ""}${color}색 물건도 챙겨요.`,
  },
  yuna: {
    enter: (who) => `${who}오늘 하늘 내가 읽어 줄게.`,
    birth: (who) => `${who}네 생일부터 알려 줘. 한 번만 하면 돼.`,
    calc: "네 생일 기억나! 오늘 하늘은 내가 볼게.",
    picked: { fandom: "역시 덕질부터지!", luck: "챙길 것부터? 좋아!" },
    scoreLine: (score, grade) => `${score}점! ${grade}이야.`,
    people: {
      high: "선배가 먼저 말 걸면 그때 부탁해 봐. 미뤄 둔 거 있잖아.",
      low: "오늘은 사람 만날 때 말을 아껴 봐. 급한 부탁은 내일 해도 돼.",
    },
    fandom: (score, high) =>
      high
        ? `덕질 ${score}점! 오늘은 무대 영상 몰아 보자. 결제는 내일 해도 돼.`
        : `덕질 ${score}점. 오늘은 천천히 보자. 큰 결제는 내일로 미루자.`,
    luck: (hour, color) =>
      `${hour ? `부탁은 ${hour}에 해 봐. ` : ""}${color}색도 하나 챙겨!`,
  },
  dosa: {
    enter: (who) => `${who}구름 위까지 왔구려. 오늘 운세를 보겠소?`,
    birth: (who) => `${who}운세를 보려면 생일을 알아야 하오. 한 번만 알려 주시오.`,
    calc: "그대 생일은 기억하오. 잠시 하늘을 살피리다.",
    picked: { fandom: "덕질부터 묻는구려.", luck: "챙길 것부터 묻는구려." },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이구려.`,
    people: {
      high: "손윗사람이 말을 걸거든 미뤄 둔 청을 꺼내 보시오.",
      low: "사람 앞에서는 말을 아끼시오. 급한 청은 내일로 미루어도 늦지 않소.",
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
      "좋은 날": "누군가 먼저 손을 내밀지도 모르오.",
      "아주 좋은 날": "하고 싶던 일을 오늘 시작해 보시오.",
    },
  },
};

/** 등급별 한 마디. 풀이 표의 headline 이 있으면 그쪽을 쓴다. */
const gradeNotes: Record<string, string> = {
  "쉬어 가는 날": "오늘은 속도를 줄이고 쉬어 가자.",
  "조심하면 괜찮은 날": "한 번만 더 살피면 무난하게 지나갈 거야.",
  "무난한 날": "큰일 없이 편안하게 흘러갈 거야.",
  "좋은 날": "누가 먼저 손 내밀어 줄 수도 있어.",
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
    const note = headline
      ? `${headline}.`
      : ((tone.gradeNotes ?? gradeNotes)[input.grade] ?? "");
    return `${tone.scoreLine(input.score, input.grade)} ${note}`.trim();
  }
  if (talk === 2) return input.people >= 80 ? tone.people.high : tone.people.low;
  if (talk === 3) return `${picked === "fandom" ? `${tone.picked.fandom} ` : ""}${tone.fandom(input.fandom, input.fandom >= 80)}`;
  return `${picked === "luck" ? `${tone.picked.luck} ` : ""}${tone.luck(hourText(input.luckyHour), input.color)}`;
}
