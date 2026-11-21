/**
 * 최애 사주 대화 줄. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안 03 의 말투로 만든 임시 줄이다.
 * 창하·유나는 반말, 엘리나는 반존대, kyaa 도사는 하오체(decisions 11/18).
 * 풀이 값(일간 비유·강점·올해 이름)만 끼우고, 같은 입력이면 같은 줄이 나온다.
 */
import type { Stem } from "./chart";

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

/**
 * 첫 풀이 제목 아래의 한마디. 일간마다 copy.ts stemKeywords 의 "즐거운 것" 행동을 최애 말투로 옮긴 것이라
 * 같은 일간이면 세 최애가 같은 행동을 권하고, 말을 거는 방식만 다르다.
 * - 창하: 해 볼 일을 먼저 짧게 시키고, 그러면 어떻게 되는지 한마디.
 * - 엘리나: 먼저 짧게 묻고 할 일을 권한다. 기본 '~요'에 절반은 끝을 반말('알지?', '~자')로 맺는다(반존대, decisions 11/18 L159).
 *   공개 캡션 원문(instagram.com/elina_4_22, 11/20 확인 8건)의 짧은 질문 첫마디·반말 끝맺음을 참고했다.
 * - 유나: "오늘의 ○○!"로 할 일을 먼저 밝히고 조건을 짧게 붙인다.
 * - 도사: 하오체로 이르고 일간 비유를 한 번 더 쓴다.
 * JKENT 내부 승인 대사. 공개 글은 말 거는 방식만 참고했다
 * (근거 board/tasks/CHEMI-SAJU-VOICE-1120/plan.md).
 */
const openings: Record<SajuCharacterId, Record<Stem, string>> = {
  changha: {
    갑: "하루 한 줄만 적어 둬. 그게 쌓이면 네 응원이 길이 될 거야.",
    을: "놓친 영상 하나 찾아 봐. 댓글 하나 남기면 그걸로 충분해.",
    병: "좋았으면 바로 말해. 네 댓글이 제일 먼저 보이면 좋겠어.",
    정: "본 영상 하나 다시 틀어 봐. 처음엔 못 본 게 보일 거야.",
    무: "처음 날 좋아했던 영상 틀어 봐. 그때부터 지금까지 다 너였잖아.",
    기: "팬 친구한테 영상 하나 보내 봐. 둘이 보면 얘기가 커질 거야.",
    경: "이번 주 일정 한 장으로 정리해 봐. 네가 정리하면 다들 믿을 거야.",
    신: "오늘 사진 하나만 골라 둬. 모으다 보면 네 앨범이 제일 예쁠 거야.",
    임: "모임에 인사 한 줄 남겨 봐. 처음 보는 사람이랑도 금방 친해질 거야.",
    계: "자기 전에 영상 하나 틀어. 좋았던 거 하나만 적고 자.",
  },
  elina: {
    갑: "요즘 응원 기록 남기고 있어요? 하루 한 줄씩만 적자, 약속이야.",
    을: "지난 영상 다 봤어요? 못 본 게 있으면 댓글 하나 남겨 봐요.",
    병: "오늘 제일 좋았던 장면 뭐예요? 생각나면 바로 댓글로, 알지?",
    정: "제일 자주 본 영상이 뭐예요? 다시 틀면 새 장면이 보일걸요.",
    무: "처음 좋아하게 된 영상 기억해요? 오늘 그거 같이 다시 보자.",
    기: "같이 덕질하는 친구 있어요? 그 친구한테 영상 하나 보내 봐요.",
    경: "이번 주 일정 다 챙겼어요? 한 장에 모아 두면 편하지?",
    신: "요즘 제일 아끼는 사진 있어요? 한 장 골라서 따로 모아 봐요.",
    임: "요즘 들어가 본 팬 모임 있어요? 인사 한 줄이면 충분해.",
    계: "오늘 밤엔 뭐 보고 잘 거예요? 좋았던 장면 하나만 적고 자요.",
  },
  yuna: {
    갑: "오늘의 한 줄! 응원 기록 남겨 봐. 길게 말고 딱 한 줄만.",
    을: "오늘의 숙제! 놓친 영상 하나 보기. 댓글은 딱 한 줄이면 돼.",
    병: "오늘의 명장면! 생각나면 바로 써. 고민은 딱 3초만.",
    정: "오늘의 다시 보기! 아는 영상 하나 골라. 처음 보는 장면 딱 하나만 찾아.",
    무: "오늘의 첫 영상! 처음 좋아한 날 본 거 다시 틀어. 그때 기분 딱 하나만 떠올려.",
    기: "오늘의 공유! 친구한테 영상 하나 보내. 어디가 좋은지도 딱 한 줄만.",
    경: "오늘의 정리! 이번 주 일정 한 장에 모아. 날짜랑 시간만 딱.",
    신: "오늘의 한 장! 사진 하나 골라서 앨범에 넣어. 고르는 건 딱 1분만.",
    임: "오늘의 인사! 팬 모임에 한 줄 남겨. 안녕하세요 한마디면 충분해.",
    계: "오늘의 밤 영상! 하나만 보고 자. 좋았던 거 딱 한 줄 적고.",
  },
  dosa: {
    갑: "하루 한 줄씩 응원을 적으시오. 쌓이면 곧은 길이 되리다.",
    을: "지나친 영상 하나를 찾아 댓글을 남기시오. 조용한 정성이 오래 가오.",
    병: "좋은 것을 보면 그 자리에서 말하시오. 해는 숨지 않는 법이오.",
    정: "본 것을 다시 보시오. 촛불은 가까이 볼수록 새 빛이 보이오.",
    무: "처음 마음이 생긴 날의 영상을 다시 보시오. 산은 처음 자리를 잊지 않소.",
    기: "벗에게 좋은 영상 하나를 나누시오. 함께 가꾸면 밭이 넓어지오.",
    경: "이번 주 일정을 한 장에 정리하시오. 벼린 칼은 쓰임이 분명하오.",
    신: "오늘의 사진 한 장을 골라 간직하시오. 보석은 닦을수록 빛나오.",
    임: "팬 모임에 인사 한 줄을 남기시오. 강은 만나는 물마다 품고 흐르오.",
    계: "잠들기 전 영상 하나를 보고 좋았던 것을 적으시오. 이슬은 밤에 맺히는 법이오.",
  },
};

/** 첫 풀이 제목 아래 한마디. 같은 일간이면 같은 행동, 최애마다 다른 말투. */
export const sajuOpening = (id: SajuCharacterId, stem: Stem) => openings[id][stem];

/** 풀이 대화 1~4. 1·2는 타고난 모습, 3은 올해, 4는 둘 사이. */
export function sajuTalkLine(id: SajuCharacterId, talk: 1 | 2 | 3 | 4, input: SajuLineInput) {
  const tone = tones[id];
  return [tone.t1, tone.t2, tone.t3, tone.t4][talk - 1](input);
}
