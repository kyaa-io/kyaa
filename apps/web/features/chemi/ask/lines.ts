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

export const askVoice: Record<AskCharacter, Voice> = { changha: "ban", elina: "yo", yuna: "ban", dosa: "hao" };
export const askName: Record<AskCharacter, string> = { changha: "창하", elina: "엘리나", yuna: "유나", dosa: "kyaa 도사" };

export const askLines: Record<Voice, {
  topic: string;
  /** 같은 날 다시 왔을 때의 짧은 인사(기획 03-3 18). */
  again: string;
  /** 답을 기다리는 동안의 한 마디(기획 03-6 06). 무엇을 다시 보는지는 콘텐츠가 정한다. */
  think: (what: string) => string;
  follow: string;
  rest: string;
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
    rest: "오늘 이야기 재밌었어. 내일 또 와.",
    reminded: "응, 내일 기다릴게.",
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
    rest: "오늘 이야기 즐거웠어요. 내일 또 와요.",
    reminded: "네, 내일 기다릴게요.",
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
    rest: "오늘 이야기 즐거웠소. 내일 또 오시오.",
    reminded: "좋소, 내일 기다리겠소.",
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

/** 한 쪽에 담는 글자 수. 대화 상자 세 줄(390px)에 들어간다. */
const PAGE_LETTERS = 60;
/**
 * 답을 쪽으로 나눈다. 줄 바꿈이 있으면 줄마다 한 쪽이고, 줄 바꿈 없이 한 문단으로 온 답(AI 답)은
 * 문장 끝에서 끊어 한 쪽에 60자 안팎으로 묶는다. 문장 하나가 60자를 넘으면 그 문장만 한 쪽이 된다.
 */
export function askPages(answer: string) {
  return answer.split("\n").flatMap((line) => {
    const pages: string[] = [];
    for (const sentence of line.match(/.+?[.!?…~]+(?:\s+|$)|.+$/g) ?? []) {
      const last = pages.at(-1);
      if (last !== undefined && (last + sentence).trim().length <= PAGE_LETTERS) pages[pages.length - 1] = last + sentence;
      else pages.push(sentence);
    }
    return pages.map((page) => page.trim()).filter(Boolean);
  });
}

export const askExamples = (topic: AskTopic, character: AskCharacter) =>
  examples[topic].map((pair) => pair[askVoice[character] === "ban" ? 0 : 1]);

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
