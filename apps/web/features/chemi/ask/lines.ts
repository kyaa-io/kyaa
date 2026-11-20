/**
 * 질문하기 장면에서 최애가 하는 말과 주제별 예시 질문. 다른 케미 대화 줄(fortune/lines.ts 등)처럼 한국어 원문만 둔다.
 * 최애는 한도·오류·결제를 말하지 않는다(L158): 그런 안내는 화면 글자(chemi.json readingUi.ask*)가 맡는다.
 */
export const ASK_TOPICS = ["love", "work", "money", "people", "month", "free"] as const;
export type AskTopic = (typeof ASK_TOPICS)[number];
export type AskCharacter = "changha" | "elina" | "yuna" | "dosa";
export type AskContent = "saju" | "fortune" | "star" | "tarot";
type Voice = "ban" | "yo" | "hao";

export const askVoice: Record<AskCharacter, Voice> = { changha: "ban", elina: "yo", yuna: "ban", dosa: "hao" };
export const askName: Record<AskCharacter, string> = { changha: "창하", elina: "엘리나", yuna: "유나", dosa: "kyaa 도사" };

export const askLines: Record<Voice, {
  topic: string;
  follow: string;
  rest: string;
  reminded: string;
  shared: string;
  reask: Record<AskTopic, string>;
}> = {
  ban: {
    topic: "좋아, 뭐가 제일 궁금해?",
    follow: "더 궁금한 거 있어? 하나 더 말해 봐.",
    rest: "오늘 이야기 재밌었어. 내일 또 와.",
    reminded: "응, 내일 기다릴게.",
    shared: "자랑해 줘서 고마워. 하나 더 물어봐.",
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
    follow: "더 궁금한 게 있어요? 하나 더 말해 봐요.",
    rest: "오늘 이야기 즐거웠어요. 내일 또 와요.",
    reminded: "네, 내일 기다릴게요.",
    shared: "자랑해 줘서 고마워요. 하나 더 물어봐요.",
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
    follow: "더 궁금한 것이 있소? 하나 더 말해 보시오.",
    rest: "오늘 이야기 즐거웠소. 내일 또 오시오.",
    reminded: "좋소, 내일 기다리겠소.",
    shared: "자랑해 주어 고맙소. 하나 더 물으시오.",
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
