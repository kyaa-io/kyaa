/**
 * 별자리 운세 문구 표. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안(05-2·05-3)의 말투로 만든 임시 문장이다.
 * 별 개수·영역·행성 이름만 끼우고, 같은 입력이면 같은 문장이 나온다. AS-TX 표가 오면 이 파일만 바꾼다.
 */
import { withParticle } from "./particle";

export const starCharacters = [
  { id: "changha", name: "창하", sign: "aquarius" },
  { id: "elina", name: "엘리나", sign: "taurus" },
  { id: "yuna", name: "유나", sign: "aquarius" },
  { id: "dosa", name: "kyaa 도사", sign: null },
] as const;
export type StarCharacterId = (typeof starCharacters)[number]["id"];

export const zodiacSigns = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;
export type ZodiacSign = (typeof zodiacSigns)[number];

/** 별자리 이름. 원판 바퀴 글자는 시안 05-3의 짧은 이름을 쓴다. */
/** 별자리 기호(글자 모양으로 그린다). '나' 원 안에 쓴다. */
export const signGlyphs: Record<ZodiacSign, string> = {
  aries: "\u2648\uFE0E",
  taurus: "\u2649\uFE0E",
  gemini: "\u264A\uFE0E",
  cancer: "\u264B\uFE0E",
  leo: "\u264C\uFE0E",
  virgo: "\u264D\uFE0E",
  libra: "\u264E\uFE0E",
  scorpio: "\u264F\uFE0E",
  sagittarius: "\u2650\uFE0E",
  capricorn: "\u2651\uFE0E",
  aquarius: "\u2652\uFE0E",
  pisces: "\u2653\uFE0E",
};
export const signNames: Record<ZodiacSign, { full: string; short: string; bare: string }> = {
  aries: { full: "양자리", short: "양", bare: "양" },
  taurus: { full: "황소자리", short: "황소", bare: "황소" },
  gemini: { full: "쌍둥이자리", short: "쌍", bare: "쌍둥이" },
  cancer: { full: "게자리", short: "게", bare: "게" },
  leo: { full: "사자자리", short: "사자", bare: "사자" },
  virgo: { full: "처녀자리", short: "처녀", bare: "처녀" },
  libra: { full: "천칭자리", short: "천칭", bare: "천칭" },
  scorpio: { full: "전갈자리", short: "전갈", bare: "전갈" },
  sagittarius: { full: "사수자리", short: "사수", bare: "사수" },
  capricorn: { full: "염소자리", short: "염소", bare: "염소" },
  aquarius: { full: "물병자리", short: "물병", bare: "물병" },
  pisces: { full: "물고기자리", short: "물", bare: "물고기" },
};

export const bodyNames: Record<string, string> = {
  Sun: "해",
  Moon: "달",
  Mercury: "수성",
  Venus: "금성",
  Mars: "화성",
  Jupiter: "목성",
  Saturn: "토성",
  Uranus: "천왕성",
  Neptune: "해왕성",
  Pluto: "명왕성",
};

/** 가중치 표의 각도 다섯 가지. */
export const aspectNames: Record<number, { name: string; smooth: boolean | null }> = {
  0: { name: "합", smooth: null },
  60: { name: "육분", smooth: true },
  90: { name: "사각", smooth: false },
  120: { name: "삼각", smooth: true },
  180: { name: "대립", smooth: false },
};

export const domains = ["love", "people", "money", "work"] as const;
export type StarDomain = (typeof domains)[number];
export const domainLabels: Record<StarDomain | "overall", string> = {
  overall: "총운",
  love: "애정",
  people: "사람",
  money: "돈",
  work: "일·공부",
};

/** 오늘 행성이 어느 영역을 움직이는지. 서버 점수 규칙(score.ts)의 행성 배정과 같다. */
const bodyDomain: Record<string, StarDomain | undefined> = {
  Venus: "love",
  Jupiter: "money",
  Saturn: "work",
  Mars: "work",
  Mercury: "people",
};
export function reasonDomain(body: string): StarDomain | "overall" {
  return bodyDomain[body] ?? "overall";
}

export const overallHeadline = [
  "천천히 가야 편한 날",
  "한 박자 쉬어 가는 날",
  "무난하게 흘러가는 날",
  "먼저 말 걸면 잘 풀리는 날",
  "별이 한꺼번에 밝은 날",
] as const;

export const domainLine: Record<StarDomain, readonly string[]> = {
  love: [
    "마음은 접어 두는 쪽이 편한 날이에요.",
    "말 한마디가 오래 남는 날이에요.",
    "평소처럼 지내면 무난한 날이에요.",
    "먼저 건넨 인사가 잘 돌아와요.",
    "답장이 빨리 오는 날. 미뤄 둔 말 꺼내기 좋아요.",
  ],
  people: [
    "오늘은 혼자 있는 시간이 더 편해요.",
    "오해가 생기기 쉬우니 한 번 확인하고 답해요.",
    "새 만남보다 익숙한 사람이 편해요.",
    "오랜만의 연락이 반가워요.",
    "어디서든 말이 잘 통하는 날이에요.",
  ],
  money: [
    "충동 구매는 하루 미뤄요.",
    "장바구니는 열어 두기만 해요.",
    "작은 지출을 살피기 좋은 날이에요.",
    "필요한 것을 고르는 눈이 밝아요.",
    "계획한 소비가 잘 맞아떨어져요.",
  ],
  work: [
    "큰 결정은 내일로 넘겨도 돼요.",
    "속도가 느려도 괜찮은 날이에요.",
    "저녁에 몰아서 풀려요.",
    "집중이 잘 이어지는 날이에요.",
    "미뤄 둔 일을 끝내기 좋은 날이에요.",
  ],
};

/** 결과 카드에 길게 쓰는 분야 풀이(가장 밝은 영역). */
export const domainLong: Record<StarDomain, readonly string[]> = {
  love: [
    "마음은 접어 두는 쪽이 편해요. 오늘은 말을 아끼고 내일 다시 꺼내 봐요.",
    "말 한마디가 오래 남는 날이에요. 보내기 전에 한 번 더 읽어 봐요.",
    "평소처럼 지내면 무난해요. 새로 꺼낼 이야기는 없어도 괜찮아요.",
    "먼저 건넨 인사가 잘 돌아와요. 연락하고 싶은 사람이 있으면 가볍게 시작해요.",
    "답장이 빨리 오는 날이에요. 미뤄 둔 말이 있으면 오늘 꺼내세요. 저녁 약속이 생각보다 길어질 수 있어요.",
  ],
  people: [
    "혼자 있는 시간이 편해요. 모임은 짧게 다녀와도 돼요.",
    "말이 다르게 전해지기 쉬워요. 중요한 말은 글로 남겨 두세요.",
    "새 만남보다 익숙한 사람과 있을 때 마음이 놓여요.",
    "오랜만의 연락이 반가워요. 답을 미뤄 둔 사람이 있으면 오늘 보내요.",
    "어디서든 말이 잘 통해요. 부탁이나 제안을 꺼내기 좋아요.",
  ],
  money: [
    "충동이 크게 와요. 결제 버튼은 하루 두었다가 눌러요.",
    "장바구니는 열어 두기만 해요. 진짜 필요한지는 내일 다시 봐요.",
    "작은 지출을 한 번 살펴보기 좋아요. 구독이나 자동 결제부터 열어 봐요.",
    "필요한 것을 고르는 눈이 밝아요. 비교하고 사면 후회가 적어요.",
    "계획한 소비가 잘 맞아떨어져요. 미뤄 둔 필수품을 사기 좋아요.",
  ],
  work: [
    "큰 결정은 내일로 넘겨도 돼요. 오늘은 정리만 해도 충분해요.",
    "속도가 나지 않아도 괜찮아요. 쉬운 일부터 끝내 가요.",
    "낮에는 더디다가 저녁에 몰아서 풀려요. 어려운 일은 늦게 잡아요.",
    "집중이 길게 이어져요. 오래 걸리는 일을 지금 시작해요.",
    "미뤄 둔 일을 끝내기 좋아요. 마감이 있는 것부터 닫아요.",
  ],
};

export const todayDo: Record<StarDomain, readonly string[]> = {
  love: ["먼저 연락하기", "오후에 부탁할 말 꺼내기", "좋아하는 노래 크게 듣기"],
  people: ["안부 묻는 메시지 보내기", "약속 시간 미리 확인하기", "모임에서 먼저 인사하기"],
  money: ["구독 목록 열어 보기", "살 것 목록 하나로 줄이기", "영수증 정리하기"],
  work: ["가장 어려운 일부터 열기", "마감 순서 다시 적기", "저녁에 한 시간 몰아서 하기"],
};
export const todayDont: Record<StarDomain, readonly string[]> = {
  love: ["답장을 하루 넘기기", "속마음을 에둘러 말하기", "지난 일 다시 꺼내기"],
  people: ["남의 말 끊고 결론 내기", "약속 두 개 겹쳐 잡기", "단체 방에서 길게 반박하기"],
  money: ["밤늦게 장바구니 결제하기", "할인에 끌려 하나 더 담기", "친구 몫을 먼저 내 주기"],
  work: ["서두르다 두 번 하기", "큰 결정 오늘 내리기", "끝낸 일을 또 고치기"],
};

/**
 * 각도마다 [다가오는 중, 멀어지는 중]. 도움·부담 이름표는 각도의 성질로 정한다(육분·삼각 = 도움, 사각·대립 = 부담).
 * 멀어지는 중이면 그 힘이 옅어진다고만 말한다. 합은 성질이 정해져 있지 않아 점수 부호를 따른다.
 */
const aspectPhrase: Record<number, readonly [string, string]> = {
  0: ["겹쳐서 힘을 실어 줘요", "겹쳐서 부담을 줘요"],
  60: ["잘 어울려요", "잘 어울리다 한 발 멀어지고 있어요"],
  90: ["부딪쳐서 부담을 줘요", "부딪친 뒤 풀려 가요"],
  120: ["부드럽게 이어져 있어요", "부드럽게 이어지다 한 발 멀어지고 있어요"],
  180: ["마주 보며 부담을 줘요", "마주 본 채 풀려 가요"],
};
const fadingLine = { smooth: "받던 도움이 조금씩 옅어져요.", hard: "눌리던 것이 조금씩 가벼워져요." };
const toneLine: Record<StarDomain | "overall", { smooth: string; hard: string }> = {
  love: { smooth: "마음을 꺼내기 쉬운 때예요.", hard: "말이 날카롭게 들릴 수 있어요." },
  people: { smooth: "저녁 약속에서 대화가 잘 풀릴 수 있어요.", hard: "서두르면 오해가 생길 수 있어요." },
  money: { smooth: "필요한 것을 고르기 좋은 때예요.", hard: "큰 결제는 미루는 쪽이 편해요." },
  work: { smooth: "일이 순하게 풀리는 때예요.", hard: "서두르면 두 번 하게 될 수 있어요." },
  overall: { smooth: "하루가 순하게 흘러가요.", hard: "작은 일에 마음이 쓰일 수 있어요." },
};

/** 시안 05-3의 이름 짓는 규칙: 오늘 행성 + 내 행성/지점. */
export function targetName(target: string) {
  if (target === "ASC") return "첫인상";
  if (target === "MC") return "하늘 꼭대기";
  return bodyNames[target] ?? target;
}

export type StarReason = {
  body: string;
  target: string;
  angle: number;
  hour: number;
  applying: boolean;
  score: number;
  exitDate: string;
};

export type ReasonView = {
  title: string;
  aspect: string;
  domain: StarDomain | "overall";
  up: boolean;
  when: string;
  /** 근거 한 줄 풀이(영역과 오르내림에 맞는 말). */
  tone: string;
  text: string;
};

function kstWeekday(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function hourWords(hour: number) {
  const part = hour < 6 ? "새벽" : hour < 12 ? "아침" : hour < 18 ? "낮" : "밤";
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `오늘 ${part} ${clock}시쯤 가장 강해요`;
}

/**
 * 서버가 돌려준 근거 한 줄을 화면 문장으로 바꾼다.
 * `signOf`: 내 행성/지점이 어느 별자리에 있는지.
 */
export function reasonView(
  reason: StarReason,
  signOf: (target: string) => ZodiacSign | null,
  today: string,
): ReasonView {
  const body = bodyNames[reason.body] ?? reason.body;
  const target = targetName(reason.target);
  const aspect = aspectNames[reason.angle] ?? { name: "각", smooth: null };
  const domain = reasonDomain(reason.body);
  const up = aspect.smooth ?? reason.score >= 0;
  const fading = aspect.smooth !== null && !reason.applying;
  const phrase = aspectPhrase[reason.angle]?.[aspect.smooth === null ? (up ? 0 : 1) : fading ? 1 : 0] ?? "이어져 있어요";
  const tone = fading ? fadingLine[up ? "smooth" : "hard"] : toneLine[domain][up ? "smooth" : "hard"];
  const sign = signOf(reason.target);
  const exit = reason.exitDate;
  // 달처럼 빨리 지나가는 행성은 가장 센 시각을, 느린 행성은 끝나는 날을 보인다.
  const when =
    reason.body === "Moon" || exit <= today
      ? hourWords(reason.hour)
      : `${Number(exit.slice(5, 7))}월 ${Number(exit.slice(8, 10))}일(${kstWeekday(exit)})까지`;
  const mine = sign ? `내 ${target}(${signNames[sign].full})` : `내 ${target}`;
  return {
    title: `${withParticle(body, "과와")} 내 ${target}`,
    aspect: aspect.name,
    domain,
    up,
    when,
    tone,
    text: `${withParticle(body, "은는")} ${withParticle(mine, "과와")} ${phrase}. ${tone}`,
  };
}

/**
 * 근거 카드에 올릴 행성 각도를 고른다. 센 순서를 지키되 서로 다른 영역이 먼저 오게 해,
 * 같은 영역 태그만 줄줄이 나오지 않게 한다(태생 시각이 없으면 해·달은 총운만 움직인다).
 */
export function pickReasons(reasons: StarReason[], count = 3) {
  const seen = new Set<string>();
  const distinct: StarReason[] = [];
  const repeated: StarReason[] = [];
  for (const reason of reasons) {
    const domain = reasonDomain(reason.body);
    if (seen.has(domain)) repeated.push(reason);
    else {
      seen.add(domain);
      distinct.push(reason);
    }
  }
  return [...distinct, ...repeated]
    .slice(0, count)
    .sort((a, b) => reasons.indexOf(a) - reasons.indexOf(b));
}

export function bestDomain(stars: Record<StarDomain, number>) {
  return domains.reduce((best, key) => (stars[key] > stars[best] ? key : best), domains[0]);
}
export function worstDomain(stars: Record<StarDomain, number>) {
  return domains.reduce((worst, key) => (stars[key] < stars[worst] ? key : worst), domains[0]);
}

/** 대화 줄. 최애마다 말끝이 다르다. */
type Tone = {
  enter: string;
  birth: string;
  calc: string;
  sign: (sign: string, headline: string) => string;
  best: (domain: string, worst: string) => string;
  why: string;
  /** calm: 오늘 총운 별이 셋 이하라 하루 전체를 좋다고 말하면 안 될 때. */
  pair: (mine: string, theirs: string, calm: boolean) => string;
  pairAlone: (mine: string) => string;
  /** 두 번째 선택지로 이야기를 골라 들었을 때 그 선택을 먼저 받아 주는 한마디. */
  picked: { why: string; pair: string };
};
const tones: Record<StarCharacterId, Tone> = {
  changha: {
    enter: "오늘 밤하늘이 너한테 뭐라는지 볼래? 칭찬이면 좋겠다.",
    birth: "별자리 운세 보려면 네 생일이 필요해. 한 번만 알려 줘.",
    calc: "잠깐, 오늘 밤하늘 좀 읽어 볼게. 좋은 거 나오면 칭찬해 줘.",
    sign: (sign, headline) => `넌 ${sign}야. 오늘은 ${headline}이야.`,
    best: (domain, worst) => `오늘은 ${domain} 별점이 제일 높아. ${worst}은 평소 정도야.`,
    why: "오늘 풀이는 행성 셋의 움직임에서 나왔어.",
    pair: (mine, theirs, calm) =>
      `오늘 달이 우리 둘 별자리와 잘 어울리는 자리에 있어. ${withParticle(theirs, "과와")} ${mine}, ${calm ? "우리 사이는 잘 맞아. 하루는 천천히 가자." : "오늘은 내가 너 응원하기 딱 좋은 날이네?"}`,
    pairAlone: () => "별자리는 여기까지야. 오늘 정리를 볼래?",
    picked: { why: "이유부터 궁금했구나.", pair: "우리 사이부터 묻네." },
  },
  elina: {
    enter: "춥진 않아요? 오늘 밤하늘 같이 천천히 봐요.",
    birth: "별자리 운세를 보려면 생일이 필요해요. 한 번만 알려 줘요.",
    calc: "잠깐만요, 오늘 밤하늘 천천히 읽어 볼게요.",
    sign: (sign, headline) => `${sign}네요. 오늘은 ${headline}이에요.`,
    best: (domain, worst) => `오늘은 ${domain} 별점이 가장 높아요. ${worst}은 평소 정도예요.`,
    why: "오늘 풀이는 행성 셋의 움직임에서 나왔어요.",
    pair: (mine, theirs, calm) =>
      `오늘 달이 두 별자리와 잘 어울리는 자리에 있어요. ${withParticle(theirs, "과와")} ${mine}, ${calm ? "사이는 잘 맞는 날이에요. 하루는 천천히 가요." : "오늘은 내가 더 챙겨 줄게요."}`,
    pairAlone: () => "별자리는 여기까지예요. 오늘 정리를 볼래요?",
    picked: { why: "이유가 먼저 궁금했군요.", pair: "우리 사이가 먼저 궁금했군요." },
  },
  yuna: {
    enter: "오늘 밤하늘이 뭐라는지 콕 집어 줄게.",
    birth: "별자리 운세 보려면 네 생일부터 알려 줘. 한 번만 하면 돼.",
    calc: "잠깐만, 오늘 밤하늘 하나씩 짚어 볼게.",
    sign: (sign, headline) => `${sign}구나. 오늘은 ${headline}이야.`,
    best: (domain, worst) => `${domain} 별점이 제일 높아. ${worst}은 평소 정도야.`,
    why: "오늘 풀이는 행성 셋이 움직여서 나왔어.",
    pair: (mine, theirs, calm) =>
      `오늘 달이 우리 둘 별자리랑 잘 어울리는 자리에 있어. ${withParticle(theirs, "이랑")} ${mine}, ${calm ? "사이는 잘 맞는 날이야. 하루는 천천히 가자." : "하고 싶은 말 있으면 오늘 바로 해."}`,
    pairAlone: () => "별자리는 여기까지야. 오늘 정리 볼래?",
    picked: { why: "이유부터 묻네. 좋아.", pair: "우리 궁합부터 묻네. 좋아." },
  },
  dosa: {
    enter: "오늘 밤하늘이 무어라 이르는지 같이 보겠소?",
    birth: "별자리를 보려면 생일을 알아야 하오. 한 번만 알려 주시오.",
    calc: "잠시 오늘 밤하늘을 살피리다.",
    sign: (sign, headline) => `그대는 ${sign}이구려. 오늘은 ${headline}이오.`,
    best: (domain, worst) => `오늘은 ${domain} 별점이 가장 높소. ${worst}은 평소와 같소.`,
    why: "오늘 풀이는 행성 셋의 움직임에서 나왔소.",
    pair: () => "별은 여기까지 읽었소. 오늘 정리를 보시겠소?",
    pairAlone: () => "별은 여기까지 읽었소. 오늘 정리를 보시겠소?",
    picked: { why: "까닭부터 묻는구려.", pair: "" },
  },
};

export function starEnterLine(character: StarCharacterId, mode: "enter" | "birth" = "enter") {
  return tones[character][mode];
}
export function starCalcLine(character: StarCharacterId) {
  return tones[character].calc;
}
export function starSignLine(character: StarCharacterId, sign: string, headline: string) {
  return tones[character].sign(sign, headline);
}
export function starBestLine(character: StarCharacterId, domain: string, worst: string) {
  return tones[character].best(domain, worst);
}
export function starWhyLine(character: StarCharacterId, picked = false) {
  return `${picked ? `${tones[character].picked.why} ` : ""}${tones[character].why}`;
}
export function starPairLine(
  character: StarCharacterId,
  mine: string | null,
  theirs: string | null,
  picked = false,
  /** 오늘 총운 별 수. 셋 이하면 '사이'만 좋다고 말한다. */
  overall = 5,
) {
  const tone = tones[character];
  const line = mine && theirs ? tone.pair(mine, theirs, overall <= 3) : tone.pairAlone(mine ?? "");
  return picked && tone.picked.pair && mine && theirs ? `${tone.picked.pair} ${line}` : line;
}

/** 오늘 가장 밝은 영역의 한마디(결과 오른쪽 한마디 줄). */
const sayAsk: Record<StarDomain, { plain: string; polite: string; old: string }> = {
  love: { plain: "누구한테 먼저 연락할래?", polite: "누구에게 먼저 연락해 볼래요?", old: "누구에게 먼저 소식을 전하겠소?" },
  people: { plain: "먼저 안부 보낼 사람 있어?", polite: "먼저 안부를 건넬 사람이 있나요?", old: "먼저 안부를 건넬 이가 있소?" },
  money: { plain: "살 것부터 하나만 골라 볼래?", polite: "살 것을 하나만 골라 볼래요?", old: "살 것을 하나만 고르겠소?" },
  work: { plain: "제일 급한 일부터 열어 볼래?", polite: "제일 급한 일부터 열어 볼래요?", old: "가장 급한 일부터 열어 보겠소?" },
};
export function starSayLine(character: StarCharacterId, domain: StarDomain, stars: number) {
  const name = domainLabels[domain];
  const ask = sayAsk[domain];
  const bright = stars >= 4;
  const line = {
    changha: bright ? `${name} 별점이 ${stars}개야. ${ask.plain}` : `${name} 별은 차분해. 오늘은 천천히 가자.`,
    elina: bright ? `${name} 별점이 ${stars}개예요. ${ask.polite}` : `${name} 별은 차분해요. 천천히 가요.`,
    yuna: bright ? `${name} 별점 ${stars}개야. ${ask.plain}` : `${name} 별은 조용해. 오늘은 천천히 가자.`,
    dosa: bright ? `${name} 별이 ${stars}개 밝소. ${ask.old}` : `${name} 별은 고요하오. 천천히 걸으시오.`,
  } satisfies Record<StarCharacterId, string>;
  return line[character];
}

/** 출생 차트 한마디: 가장 많은 원소를 말한다. */
export function starChartLine(character: StarCharacterId, element: string, count: number) {
  return {
    changha: `${element} 원소가 ${count}개나 돼. 그래서 그런 모습이구나.`,
    elina: `${element} 원소가 ${count}개예요. 그래서 그런 모습이었군요.`,
    yuna: `${element} 원소가 ${count}개나 있어. 그래서 그랬구나.`,
    dosa: `${element} 원소가 ${count}개나 되오. 그래서 그런 모습이구려.`,
  }[character];
}

/** 별자리의 원소. 태어날 때 행성이 놓인 자리의 성격을 읽을 때 쓴다. */
const signElement: Record<ZodiacSign, "fire" | "earth" | "air" | "water"> = {
  aries: "fire", leo: "fire", sagittarius: "fire",
  taurus: "earth", virgo: "earth", capricorn: "earth",
  gemini: "air", libra: "air", aquarius: "air",
  cancer: "water", scorpio: "water", pisces: "water",
};
/** 영역마다 보는 내 행성(서버 점수 규칙의 행성 배정과 같다)과 그 행성이 맡은 것. */
const domainPlanet: Record<StarDomain, { body: string; role: string }> = {
  love: { body: "Venus", role: "애정" },
  people: { body: "Mercury", role: "말과 생각" },
  money: { body: "Jupiter", role: "기회와 재물" },
  work: { body: "Saturn", role: "책임과 일" },
};
const natalLine: Record<StarDomain, Record<"fire" | "earth" | "air" | "water", string>> = {
  love: {
    fire: "좋아하면 바로 표현하는 편이에요",
    earth: "천천히 믿음이 쌓여야 마음을 여는 편이에요",
    air: "말이 통해야 마음이 가는 편이에요",
    water: "말보다 분위기와 마음 씀을 먼저 느끼는 편이에요",
  },
  people: {
    fire: "생각나면 바로 말하는 편이에요",
    earth: "확인한 것만 차분히 말하는 편이에요",
    air: "여러 사람과 가볍게 잘 어울리는 편이에요",
    water: "상대 기분을 읽고 말을 고르는 편이에요",
  },
  money: {
    fire: "기회다 싶으면 크게 움직이는 편이에요",
    earth: "모으고 불리는 데 운이 붙는 편이에요",
    air: "사람과 정보에서 기회를 얻는 편이에요",
    water: "마음이 가는 곳에 돈을 쓰는 편이에요",
  },
  work: {
    fire: "앞장서서 책임을 지는 편이에요",
    earth: "꾸준히 쌓아 결과를 내는 편이에요",
    air: "생각을 구조로 정리하는 데 강한 편이에요",
    water: "함께하는 사람까지 챙기며 일하는 편이에요",
  },
};

/**
 * 영역 한 칸의 풀이: 오늘 별점의 풀이(2~3문장) 뒤에, 태어날 때 그 영역을 맡은 행성이 놓인 별자리를 근거로 한 문장을 잇는다.
 * `signOf`: 내 행성이 어느 별자리에 있는지.
 */
export function starDomainText(domain: StarDomain, stars: number, signOf: (body: string) => ZodiacSign | null) {
  const today = domainLong[domain][stars - 1];
  const planet = domainPlanet[domain];
  const sign = signOf(planet.body);
  if (!sign) return today;
  return `${today} 내 ${bodyNames[planet.body]}(${planet.role})이 ${signNames[sign].full}라 ${natalLine[domain][signElement[sign]]}.`;
}
