/**
 * 질문하기 장면에서 최애가 하는 말과 주제별 예시 질문. 다른 케미 대화 줄(fortune/lines.ts 등)처럼 한국어 원문만 둔다.
 * 최애는 한도·오류·결제를 말하지 않는다(L158): 그런 안내는 화면 글자(chemi.json readingUi.ask*)가 맡는다.
 */
export const ASK_TOPICS = ["love", "work", "money", "people", "month", "free"] as const;
export type AskTopic = (typeof ASK_TOPICS)[number];
export type AskCharacter = "changha" | "elina" | "yuna" | "dosa";
export type AskContent = "saju" | "fortune" | "star" | "tarot";
type Voice = "ban" | "yo" | "hao";
/** 답을 들은 뒤 팬이 고르는 짧은 반응(차감 없음, 저장하지 않음). */
export const ASK_REACTIONS = ["thanks", "really", "worried"] as const;
export type AskReaction = (typeof ASK_REACTIONS)[number];

/** 다른 날 다시 와서 지난 질문이 어떻게 됐는지 답하는 말(저장하지 않음). skip 은 바로 새 질문으로 간다. */
export const ASK_RECALLS = ["good", "notyet", "skip"] as const;
export type AskRecall = (typeof ASK_RECALLS)[number];

export const askVoice: Record<AskCharacter, Voice> = { changha: "ban", elina: "yo", yuna: "ban", dosa: "hao" };
export const askName: Record<AskCharacter, string> = { changha: "창하", elina: "엘리나", yuna: "유나", dosa: "kyaa 도사" };

export const askLines: Record<Voice, {
  topic: string;
  /** 같은 날 다시 왔을 때의 짧은 인사(기획 03-3 18). */
  again: string;
  /** 답을 기다리는 동안의 한 마디(기획 03-6 06). 무엇을 다시 보는지는 콘텐츠가 정한다. */
  think: (what: string) => string;
  follow: string;
  /** 다른 날 다시 왔을 때 지난 질문을 먼저 묻는 말. days 는 이 최애와 이야기한 날 수(오늘 포함, 모르면 0). */
  recall: (days: number) => string;
  /** 지난 질문이 어떻게 됐는지 들은 뒤의 대답. */
  recalled: Record<Exclude<AskRecall, "skip">, string>;
  /** 오늘 질문을 다 쓴 뒤 최애의 한마디: 오늘 나눈 이야기에 대한 소감만. 한도·내일·다시 오라는 말은 하지 않는다(K-b528db, 안내는 화면 글자). */
  rest: Record<AskContent, string>;
  reminded: string;
  shared: string;
  /** 팬의 반응에 돌려주는 한 마디. 풀이에 없는 사실을 새로 말하지 않는다. */
  react: Record<AskReaction, string>;
  reask: Record<AskTopic, string>;
}> = {
  ban: {
    topic: "좋아, 뭐가 제일 궁금해?",
    again: "또 뭐 볼래?",
    think: (what) => `음, 네 ${what}부터 다시 볼게.`,
    follow: "더 궁금한 거 있어? 하나 더 말해 봐.",
    recall: (days) => `${days > 1 ? `오늘로 ${days}일째네` : "왔네"}. 지난번에 물어본 건 어떻게 됐어?`,
    recalled: { good: "다행이다. 오늘은 뭐가 궁금해?", notyet: "그렇구나. 그 얘기 더 해도 되고, 새로 물어도 돼." },
    rest: {
      saju: "네 사주로 이야기하니까 재밌었어. 물어봐 줘서 고마워.",
      fortune: "오늘 운세로 같이 이야기해서 좋았어. 물어봐 줘서 고마워.",
      star: "별 이야기 같이 해서 좋았어. 물어봐 줘서 고마워.",
      tarot: "카드 보면서 이야기해서 좋았어. 물어봐 줘서 고마워.",
    },
    reminded: "응, 오늘 이야기 잘 기억해 둘게.",
    shared: "자랑해 줘서 고마워. 하나 더 물어봐.",
    react: {
      thanks: "응, 물어봐 줘서 나도 좋았어.",
      really: "진짜야. 네 풀이에 그렇게 나와 있어.",
      worried: "걱정 마. 풀이는 조심할 곳을 미리 알려 주는 거야.",
    },
    reask: {
      love: "연애 이야기네. 요즘 누가 제일 마음에 걸려?",
      work: "일 이야기네. 요즘 어떤 일이 제일 마음에 걸려?",
      money: "돈 이야기네. 쓰는 쪽이야, 모으는 쪽이야?",
      people: "사람 이야기네. 누구랑 있었던 일이야?",
      month: "이번 달 이야기네. 뭐가 제일 궁금해?",
      free: "편하게 말해. 풀이로 볼 수 있는 건 다 봐 줄게.",
    },
  },
  yo: {
    topic: "좋아요, 뭐가 제일 궁금해요?",
    again: "또 뭐 볼래요?",
    think: (what) => `음, ${what}부터 다시 볼게요.`,
    follow: "더 궁금한 게 있어요? 하나 더 말해 봐요.",
    recall: (days) => `${days > 1 ? `오늘로 ${days}일째네요` : "왔네요"}. 지난번에 물어본 건 어떻게 됐어요?`,
    recalled: { good: "다행이에요. 오늘은 뭐가 궁금해요?", notyet: "그렇군요. 그 얘기 더 해도 되고, 새로 물어도 돼요." },
    rest: {
      saju: "사주로 이야기 나눠서 즐거웠어요. 물어봐 줘서 고마워요.",
      fortune: "오늘 운세로 같이 이야기해서 즐거웠어요. 물어봐 줘서 고마워요.",
      star: "별 이야기 같이 해서 즐거웠어요. 물어봐 줘서 고마워요.",
      tarot: "카드 보면서 이야기해서 즐거웠어요. 물어봐 줘서 고마워요.",
    },
    reminded: "네, 오늘 이야기 잘 기억해 둘게요.",
    shared: "자랑해 줘서 고마워요. 하나 더 물어봐요.",
    react: {
      thanks: "네, 물어봐 줘서 저도 좋았어요.",
      really: "진짜예요. 풀이에 그렇게 나와 있어요.",
      worried: "걱정 마요. 풀이는 조심할 곳을 미리 알려 주는 거예요.",
    },
    reask: {
      love: "연애 이야기네요. 요즘 누가 제일 마음에 걸려요?",
      work: "일 이야기네요. 요즘 어떤 일이 제일 마음에 걸려요?",
      money: "돈 이야기네요. 쓰는 쪽이에요, 모으는 쪽이에요?",
      people: "사람 이야기네요. 누구와 있었던 일이에요?",
      month: "이번 달 이야기네요. 뭐가 제일 궁금해요?",
      free: "편하게 말해요. 풀이로 볼 수 있는 건 다 봐 줄게요.",
    },
  },
  hao: {
    topic: "좋소, 무엇이 가장 궁금하오?",
    again: "또 무엇을 보겠소?",
    think: (what) => `음, 그대의 ${what}부터 다시 보겠소.`,
    follow: "더 궁금한 것이 있소? 하나 더 말해 보시오.",
    recall: (days) => `${days > 1 ? `오늘로 ${days}일째구려` : "왔구려"}. 지난번에 물은 일은 어찌 되었소?`,
    recalled: { good: "다행이오. 오늘은 무엇이 궁금하오?", notyet: "그렇구려. 그 이야기를 더 해도 좋고, 새로 물어도 좋소." },
    rest: {
      saju: "그대 사주로 이야기를 나누어 즐거웠소. 물어 주어 고맙소.",
      fortune: "오늘 운세로 이야기를 나누어 즐거웠소. 물어 주어 고맙소.",
      star: "별 이야기를 함께 나누어 즐거웠소. 물어 주어 고맙소.",
      tarot: "카드를 보며 이야기를 나누어 즐거웠소. 물어 주어 고맙소.",
    },
    reminded: "좋소, 오늘 이야기를 잘 새겨 두겠소.",
    shared: "자랑해 주어 고맙소. 하나 더 물으시오.",
    react: {
      thanks: "좋소, 물어 주어 나도 즐거웠소.",
      really: "참말이오. 그대의 풀이에 그리 나와 있소.",
      worried: "걱정 마시오. 풀이는 조심할 곳을 미리 일러 주는 것이오.",
    },
    reask: {
      love: "연애 이야기구려. 요즘 누가 가장 마음에 걸리오?",
      work: "일 이야기구려. 요즘 어떤 일이 가장 마음에 걸리오?",
      money: "돈 이야기구려. 쓰는 쪽이오, 모으는 쪽이오?",
      people: "사람 이야기구려. 누구와 있었던 일이오?",
      month: "이번 달 이야기구려. 무엇이 가장 궁금하오?",
      free: "편하게 말하시오. 풀이로 볼 수 있는 것은 다 보아 주겠소.",
    },
  },
};

/**
 * 최애마다 다른 대사. 말투 바탕(askLines) 위에 얹는다: 창하는 장난스럽게 응원, 엘리나는 다정하게 챙김(반존대), 유나는 솔직하게 콕 집는다
 * (features/chemi/persona.ts).
 */
const askOwn: Partial<Record<AskCharacter, Partial<(typeof askLines)[Voice]>>> = {
  changha: {
    topic: "좋아, 오늘은 뭐부터 털어놔 볼래? 다 들어 줄게.",
    think: (what) => `음, 네 ${what}부터 다시 볼게. 잠깐만 기다려 봐.`,
    follow: "하나 더 있지? 얼굴에 다 쓰여 있어. 말해 봐.",
  },
  elina: {
    topic: "좋아요, 뭐가 제일 궁금해? 천천히 말해 줘요.",
    think: (what) => `음, ${what}부터 천천히 다시 볼게요.`,
    follow: "더 궁금한 거 있으면 편하게 하나 더 말해 봐요.",
  },
  yuna: {
    topic: "좋아, 하나만 골라. 뭐가 제일 궁금해?",
    think: (what) => `음, 네 ${what}부터 짚어 볼게.`,
    follow: "더 궁금한 거 있으면 하나만 더 말해.",
  },
};

/** 질문하기에서 그 최애가 하는 말. */
export const askLinesFor = (character: AskCharacter) => ({ ...askLines[askVoice[character]], ...askOwn[character] });

/** 답을 기다리는 말에 넣는 이름: 최애가 다시 펼쳐 보는 것. */
export const askSubject: Record<AskContent, string> = { saju: "사주", fortune: "운세", star: "별자리", tarot: "카드" };

/** 누르면 입력칸에 채워지는 예시. 반말로 답하는 최애에게는 반말, 나머지는 존댓말. */
const examples: Record<AskTopic, readonly (readonly [ban: string, yo: string])[]> = {
  love: [
    ["요즘 연락하는 사람이랑 잘될까?", "요즘 연락하는 사람과 잘될까요?"],
    ["먼저 고백해도 될까?", "먼저 고백해도 될까요?"],
    ["헤어진 사람한테 연락해도 될까?", "헤어진 사람에게 연락해도 될까요?"],
  ],
  work: [
    ["이번 주 면접, 붙을 수 있을까?", "이번 주 면접, 붙을 수 있을까요?"],
    ["지금 팀에 남을까, 옮길까?", "지금 팀에 남을까요, 옮길까요?"],
    ["이번 달 마감, 제때 끝낼 수 있을까?", "이번 달 마감, 제때 끝낼 수 있을까요?"],
  ],
  money: [
    ["이번 달에 앨범 한 장 더 사도 될까?", "이번 달에 앨범 한 장 더 사도 될까요?"],
    ["콘서트 티켓값, 지금 써도 될까?", "콘서트 티켓값, 지금 써도 될까요?"],
    ["적금을 지금 시작해도 될까?", "적금을 지금 시작해도 될까요?"],
  ],
  people: [
    ["서운했던 친구한테 먼저 연락할까?", "서운했던 친구에게 먼저 연락할까요?"],
    ["새 모임에 나가도 괜찮을까?", "새 모임에 나가도 괜찮을까요?"],
    ["가족한테 솔직하게 말해도 될까?", "가족에게 솔직하게 말해도 될까요?"],
  ],
  month: [
    ["이번 달에 제일 조심할 건 뭐야?", "이번 달에 제일 조심할 건 뭐예요?"],
    ["이번 달에 새로 시작해도 될까?", "이번 달에 새로 시작해도 될까요?"],
    ["이사 날짜는 언제가 좋을까?", "이사 날짜는 언제가 좋을까요?"],
  ],
  free: [
    ["오늘 뭘 조심하면 좋을까?", "오늘 뭘 조심하면 좋을까요?"],
    ["내 장점을 어떻게 쓰면 좋을까?", "제 장점을 어떻게 쓰면 좋을까요?"],
  ],
};

/** 반응 버튼의 글자. 예시 질문처럼 반말로 답하는 최애에게는 반말, 나머지는 존댓말. */
const reactions: Record<AskReaction, readonly [ban: string, yo: string]> = {
  thanks: ["고마워", "고마워요"],
  really: ["진짜?", "정말요?"],
  worried: ["좀 걱정돼", "조금 걱정돼요"],
};
export const askReaction = (kind: AskReaction, character: AskCharacter) => reactions[kind][askVoice[character] === "ban" ? 0 : 1];

const recalls: Record<AskRecall, readonly [ban: string, yo: string]> = {
  good: ["잘됐어", "잘됐어요"],
  notyet: ["아직이야", "아직이에요"],
  skip: ["새로 물을래", "새로 물을래요"],
};
export const askRecall = (kind: AskRecall, character: AskCharacter) => recalls[kind][askVoice[character] === "ban" ? 0 : 1];

/**
 * 이어 묻기에서 누르면 입력칸에 채워지는 말. 방금 고른 반응에 맞는 말이 맨 앞에 온다
 * ('정말요?' → 까닭, '조금 걱정돼요' → 조심할 것). 서버는 이 말에 따라 다른 답을 준다(answerFollowup).
 */
const followups: Record<AskReaction, readonly [ban: string, yo: string]> = {
  really: ["왜 그렇게 나왔어?", "왜 그렇게 나왔어요?"],
  worried: ["뭘 조심하면 돼?", "뭘 조심하면 돼요?"],
  thanks: ["하나만 더 알려 줘", "하나만 더 알려 줘요"],
};
export function askFollowups(character: AskCharacter, first: AskReaction | null) {
  const order = first ? [first, ...ASK_REACTIONS.filter((kind) => kind !== first)] : (["really", "worried", "thanks"] as const);
  return order.map((kind) => followups[kind][askVoice[character] === "ban" ? 0 : 1]);
}

/** 한 쪽에 담는 글자 수. 대화 상자 다섯 줄(390px)에 들어간다: 근거 한 줄과 조언 두 문장이 한 쪽에 놓인다. */
const PAGE_LETTERS = 80;
/** 가로 화면의 대화 상자(640px)는 한 줄이 길어 한 쪽에 두 배 남짓 담는다. */
const WIDE_PAGE_LETTERS = 130;
/**
 * 답을 쪽으로 나눈다. 줄 바꿈으로 온 답도 이어 붙여 문장 끝에서 끊고, 한 쪽에 80자(가로 화면 130자) 안팎으로 묶는다.
 * 문장 하나가 그보다 길면 그 문장만 한 쪽이 된다. 짧은 답은 한 쪽에 다 들어가 누르지 않고 읽는다.
 */
export function askPages(answer: string, wide = false) {
  const letters = wide ? WIDE_PAGE_LETTERS : PAGE_LETTERS;
  const pages: string[] = [];
  for (const sentence of answer.replace(/\n+/g, " ").match(/.+?[.!?…~]+(?:\s+|$)|.+$/g) ?? []) {
    const last = pages.at(-1);
    if (last !== undefined && (last + sentence).trim().length <= letters) pages[pages.length - 1] = last + sentence;
    else pages.push(sentence);
  }
  return pages.map((page) => page.trim()).filter(Boolean);
}

export const askExamples = (topic: AskTopic, character: AskCharacter) =>
  examples[topic].map((pair) => pair[askVoice[character] === "ban" ? 0 : 1]);

/** 결과 화면에서 온 질문의 예시(기획 03-6 33): 결과 종류마다 6개, 날마다 3개를 돌려 보인다. */
const resultExamples: Record<AskContent, readonly (readonly [ban: string, yo: string])[]> = {
  saju: [
    ["내 사주로 보면 나는 어떤 일이 잘 맞아?", "제 사주로 보면 어떤 일이 잘 맞아요?"],
    ["올해 나한테 제일 중요한 건 뭐야?", "올해 저한테 제일 중요한 건 뭐예요?"],
    ["나는 어떤 사람한테 끌려?", "저는 어떤 사람에게 끌려요?"],
    ["내 사주에 모자란 기운은 어떻게 채워?", "제 사주에 모자란 기운은 어떻게 채워요?"],
    ["이번 달은 뭐부터 붙잡을까?", "이번 달은 뭐부터 붙잡을까요?"],
    ["돈은 어떻게 모으는 게 나한테 맞아?", "돈은 어떻게 모으는 게 저한테 맞아요?"],
  ],
  fortune: [
    ["오늘 그 연락 해도 될까?", "오늘 그 연락 해도 될까요?"],
    ["오늘 오후엔 뭘 조심해?", "오늘 오후엔 뭘 조심해요?"],
    ["오늘 덕질은 뭐부터 할까?", "오늘 덕질은 뭐부터 할까요?"],
    ["오늘 부탁할 일, 해도 될까?", "오늘 부탁할 일, 해도 될까요?"],
    ["오늘 사려던 거 사도 될까?", "오늘 사려던 거 사도 될까요?"],
    ["오늘 운을 살리려면 뭘 하면 좋아?", "오늘 운을 살리려면 뭘 하면 좋아요?"],
  ],
  star: [
    ["이번 주 연애는 어때?", "이번 주 연애는 어때요?"],
    ["오늘 별 흐름에서 조심할 건 뭐야?", "오늘 별 흐름에서 조심할 건 뭐예요?"],
    ["오늘 먼저 말 걸어도 될까?", "오늘 먼저 말 걸어도 될까요?"],
    ["일은 오늘 어떻게 풀어 갈까?", "일은 오늘 어떻게 풀어 갈까요?"],
    ["오늘 돈 쓸 일, 괜찮을까?", "오늘 돈 쓸 일, 괜찮을까요?"],
    ["나한테 오늘 힘이 되는 건 뭐야?", "저한테 오늘 힘이 되는 건 뭐예요?"],
  ],
  tarot: [
    ["이 카드, 내 연애엔 무슨 뜻이야?", "이 카드, 제 연애엔 무슨 뜻이에요?"],
    ["바라는 일, 언제쯤 될까?", "바라는 일, 언제쯤 될까요?"],
    ["지금 내가 놓치는 건 뭐야?", "지금 제가 놓치는 건 뭐예요?"],
    ["이 카드대로라면 뭘 먼저 해야 해?", "이 카드대로라면 뭘 먼저 해야 해요?"],
    ["이 카드가 일에는 어떻게 읽혀?", "이 카드가 일에는 어떻게 읽혀요?"],
    ["이 카드가 조심하라는 건 뭐야?", "이 카드가 조심하라는 건 뭐예요?"],
  ],
};
/** day = 한국 날짜(YYYY-MM-DD). 같은 날에는 같은 3개. */
export function askResultExamples(content: AskContent, character: AskCharacter, day: string) {
  const list = resultExamples[content];
  const start = Number(day.slice(8, 10)) % 2 ? 3 : 0;
  return list.slice(start, start + 3).map((pair) => pair[askVoice[character] === "ban" ? 0 : 1]);
}

/** 결과 화면에서 바로 들어왔을 때 최애의 첫 마디: 방금 본 결과를 이어받아 묻는다. */
const resultLines: Record<Voice, Record<AskContent, string>> = {
  ban: {
    saju: "방금 본 사주 그대로 펼쳐 놨어. 거기서 뭐가 제일 궁금해?",
    fortune: "방금 본 오늘 운세로 답해 줄게. 오늘 뭐 하려고?",
    star: "방금 본 별 흐름으로 답해 줄게. 뭐가 걸려?",
    tarot: "방금 뽑은 카드로 답해 줄게. 바라는 거 하나 말해 봐.",
  },
  yo: {
    saju: "방금 본 사주 그대로 펼쳐 놨어요. 거기서 뭐가 제일 궁금해요?",
    fortune: "방금 본 오늘 운세로 답해 줄게요. 오늘 뭐 하려고요?",
    star: "방금 본 별 흐름으로 답해 줄게요. 뭐가 걸려요?",
    tarot: "방금 뽑은 카드로 답해 줄게요. 바라는 거 하나 말해 봐요.",
  },
  hao: {
    saju: "방금 본 사주를 그대로 펼쳐 두었소. 무엇이 가장 궁금하오?",
    fortune: "방금 본 오늘 운세로 답하겠소. 오늘 무엇을 하려 하오?",
    star: "방금 본 별의 흐름으로 답하겠소. 무엇이 걸리오?",
    tarot: "방금 뽑은 카드로 답하겠소. 바라는 것 하나를 말해 보시오.",
  },
};
export const askResultLine = (content: AskContent, character: AskCharacter) => resultLines[askVoice[character]][content];

/** 장면 그림(세로·가로)과 대화판 얼굴. 네 콘텐츠가 이미 쓰는 승인 원화를 그대로 쓴다. */
export function askArt(content: AskContent, character: AskCharacter) {
  if (content === "tarot")
    return {
      tall: `/chemi/tarot/scene-${character}-p.webp`,
      wide: `/chemi/tarot/scene-${character}-l.webp`,
      face: `/chemi/tarot/face-${character}.webp`,
    };
  const face = `/chemi/${content}/avatar-${character}-v1.jpg`;
  if (content === "star")
    return { tall: `/chemi/star/hero-${character}-p-v1.webp`, wide: `/chemi/star/hero-${character}-l-v1.webp`, face };
  if (content === "fortune")
    return character === "changha"
      ? { tall: "/chemi/fortune/fortune-portrait-v1.webp", wide: "/chemi/fortune/fortune-v1.webp", face }
      : { tall: `/chemi/fortune/fortune-${character}-v2.webp`, wide: `/chemi/fortune/fortune-${character}-wide-v2.webp`, face };
  return {
    tall: `/chemi/saju/saju-${character}-v1.webp`,
    wide: character === "changha" ? "/chemi/saju/saju-changha-wide-v2.webp" : `/chemi/saju/saju-${character}-wide-v2.webp`,
    face,
  };
}

/**
 * 장면 배경 반복 영상(확장자 없는 주소, `SceneVideo` 가 mp4·webm 을 고른다). 가로 원화와 같은 구도·비율로 만든 것만 있어서
 * 가로 화면(1024px 이상)에서만 쓴다. 세로 반복 영상은 없다. 없는 조합은 그림만 보인다.
 */
const loops: Partial<Record<`${AskContent}-${AskCharacter}`, string>> = {
  "saju-changha": "chemi-banner-saju-loop-v1",
  "star-elina": "chemi-banner-zodiac-loop-v1",
  "star-dosa": "chemi-bg-star-sky-loop-v1",
  "tarot-yuna": "chemi-banner-tarot-loop-v1",
  "tarot-dosa": "chemi-bg-tarot-room-loop-v1",
};
export function askLoop(content: AskContent, character: AskCharacter) {
  const name = loops[`${content}-${character}`];
  return name ? `/public-assets/cms-assets/chemi/video/${name}` : null;
}
