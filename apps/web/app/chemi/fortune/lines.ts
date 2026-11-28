/**
 * 오늘의 운세 대화 줄. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안(04-2)의 말투로 만든 임시 줄이다.
 * 최애마다 나를 대하는 태도가 다르다: 창하 장난스러운 응원, 엘리나 다정하게 챙김(반존대), 유나 솔직하게 콕 집음(features/chemi/persona.ts).
 * 점수·분야·행운 값만 끼우고, 같은 입력이면 같은 줄이 나온다.
 * 대화 흐름: 1/4 총점 → 2/4 사람 → 3/4 덕질·금전 → 4/4 챙길 것. 선택지는 앞 대사에서 나온 질문이고 다음 대사가 그 답이다.
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

/** 점수 구간. 80 이상 높음, 60~79 보통, 60 미만 낮음. */
type Band = "high" | "mid" | "low";
const band = (value: number): Band => (value >= 80 ? "high" : value >= 60 ? "mid" : "low");
const brightGrades = ["좋은 날", "아주 좋은 날"];

/**
 * 대화 선택지(팬이 최애에게 하는 말). 바로 앞 대사의 낱말을 받아 묻고, 다음 대사가 그 질문의 답이 된다.
 * 1/4 → 2/4(사람): 앞 대사가 등급 한마디라 등급을 먼저 본다(쉬어 가는 날 '약속' · 조심하면 괜찮은 날 '말·답장 조심'),
 *   조심하면 괜찮은 날에 사람 점수가 높으면 '먼저 말 걸어도 돼?'(답이 '윗사람이 먼저 손 내민다'),
 *   그 밖의 등급은 사람 점수 구간(보통 '약속' · 좋은 등급에 높음 '도와줄 사람' · 나머지 '사람 쪽도').
 * 1/4 → 3/4 건너뛰기: 덕질 얘기 먼저
 * 2/4 → 3/4(덕질·금전): 사람 점수 구간(낮음 '말 줄이기 → 혼자' · 보통 '짧게 있다 와 → 다녀와서' · 높음 '윗사람 → 덕질 친구도')
 * 2/4 → 4/4 건너뛰기: 행운 시간이 있으면 '언제'(낮음은 줄인 말, 그 밖은 부탁), 없으면 나갈 때 챙길 것
 * 3/4 → 4/4(챙길 것): 금전 점수 구간
 * 4/4 대사는 누르고 온 선택지가 묻는 것부터 말한다: '뭘 챙겨?'류는 챙길 물건, '언제?'류는 행운 시간('할 말은 언제'면 할 말).
 */
export type FortuneChoiceKey =
  | "peopleRest"
  | "peopleCareful"
  | "peopleFirst"
  | "peopleAlso"
  | "peoplePlan"
  | "peopleHelper"
  | "fandomFirst"
  | "fandomSolo"
  | "fandomAfter"
  | "fandomFriend"
  | "whenSay"
  | "whenAsk"
  | "luckFirst"
  | "bringInstead"
  | "bringThen"
  | "bringMore";
type Choices = Record<FortuneChoiceKey, string>;

type Tone = {
  enter: (who: string) => string;
  birth: (who: string) => string;
  calc: string;
  scoreLine: (score: number, grade: string) => string;
  people: Record<Band, string>;
  /** 덕질 풀이: 덕질 점수 구간 × 사람 점수 구간(낮음 혼자·보통·높음 덕질 친구)마다 오늘 할 팬 활동 하나. */
  fandom: Record<Band, Record<Band, string>>;
  /** 금전 풀이: 점수 구간마다 오늘 할 일 하나. */
  money: Record<Band, string>;
  /** 4/4 시간 문장: 부탁(say 면 할 말)하기 좋은 행운 시간. */
  time: (hour: string, say: boolean) => string;
  /** 4/4 챙길 것 문장: 행운색 물건. afterTime 은 시간 문장 뒤에 이어 말할 때다. */
  item: (color: string, afterTime: boolean) => string;
  /** 두 번째 선택지로 이야기를 골라 들었을 때 그 선택을 먼저 받아 주는 한마디. */
  picked: { fandom: string; luck: string };
  /** 등급별 한 마디. 세 최애는 자기 태도(features/chemi/persona.ts)대로 말한다. */
  gradeNotes?: Record<string, string>;
  choice: Choices;
};

const tones: Record<FortuneCharacterId, Tone> = {
  changha: {
    enter: (who) => `${who}구름 위까지 올라왔네? 오늘 운세 내가 봐 줄게, 기대해.`,
    birth: (who) => `${who}운세 보려면 네 생일이 필요해. 한 번만 알려 줘.`,
    calc: "생일은 기억해. 오늘 하늘에서 뭐가 달라졌는지 볼까?",
    picked: { fandom: "덕질부터 궁금했구나.", luck: "챙길 것부터 묻네. 좋아." },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이야.`,
    gradeNotes: {
      "쉬어 가는 날": "약속이 겹치면 덜 급한 건 내일로 미뤄. 오늘은 빈칸도 좀 남겨 두자.",
      "조심하면 괜찮은 날": "조심만 하면 괜찮아. 말하기 전에 딱 한 번만 더 생각해.",
      "무난한 날": "늘 하던 순서 있지? 오늘은 그게 제일 빨라.",
      "좋은 날": "하던 일이 술술 풀려. 어제 막힌 데부터 다시 손대 볼래?",
      "아주 좋은 날": "오늘은 네가 센터야. 미뤄 둔 일부터 해 봐.",
    },
    people: {
      high: "선배나 윗사람이 먼저 손 내밀 수도 있어. 반갑게 받아 주면 돼.",
      mid: "아는 사람들이랑은 편한 날이야. 처음 보는 자리만 짧게 있다 와.",
      low: "오늘은 누구랑 있든 말 줄이는 게 좋아. 듣는 쪽이 편할 거야.",
    },
    fandom: {
      high: {
        low: "밀린 떡밥 몰아 보기 딱이야. 다시 돌려 본 장면에 표시해 둬. 나중에 찾기 쉽잖아.",
        mid: "무대에서 뭐가 좋았는지 글로 남겨 봐. 생각나는 장면부터.",
        high: "덕질 친구랑 직캠 같이 보면서 실컷 떠들어도 되는 날이야.",
      },
      mid: {
        low: "혼자 조용히 하자. 출석 체크하고 사진 한 장 저장하면 끝.",
        mid: "눈에 들어온 순간을 댓글로 적어 봐.",
        high: "만나면 좋아하는 장면 하나씩 골라 와서 같이 봐.",
      },
      low: {
        low: "혼자 쉬엄쉬엄 하자. 갖고 있는 포카 정리하면 딱이야.",
        mid: "출석 체크만 하고 쉬어. 그것도 덕질이야.",
        high: "친구가 보여 주고 싶은 직캠부터 틀자. 밀린 건 다음에 봐도 되지.",
      },
    },
    money: {
      high: "돈 흐름은 좋아. 받을 돈 있으면 오늘 말 꺼내 봐.",
      mid: "돈은 평소대로. 살 건 저녁에 한 번 더 보고 정해.",
      low: "돈은 아끼자. 굿즈는 장바구니에만 담아 둬.",
    },
    time: (hour, say) => `${say ? "할 말은" : "부탁할 거 있으면"} ${hour}에 해.`,
    item: (color, afterTime) =>
      afterTime ? `${color}색 물건도 하나 챙기고, 그럼 오늘은 네 편이야.` : `${color}색 물건 하나 챙겨. 그럼 오늘은 네 편이야.`,
    choice: {
      peopleRest: "누구랑 잡지?",
      peopleCareful: "누굴 조심해야 돼?",
      peopleFirst: "먼저 말 걸어도 돼?",
      peopleAlso: "사람 쪽도 괜찮아?",
      peoplePlan: "약속 잡아도 돼?",
      peopleHelper: "도와줄 사람도 있어?",
      fandomFirst: "덕질부터 봐 줘",
      fandomSolo: "혼자 덕질할까?",
      fandomAfter: "다녀와서 덕질할까?",
      fandomFriend: "친구도 만날까?",
      whenSay: "할 말은 언제 해?",
      whenAsk: "부탁은 언제 해?",
      luckFirst: "나갈 때 뭘 챙겨?",
      bringInstead: "대신 뭘 챙겨?",
      bringThen: "그럼 뭘 챙길까?",
      bringMore: "운 더 올리려면?",
    },
  },
  elina: {
    enter: (who) => `${who}여기까지 오느라 힘들었죠? 오늘 운세 같이 봐요.`,
    birth: (who) => `${who}운세를 보려면 생일이 필요해요. 한 번만 알려 줘요.`,
    calc: "생일은 기억해요. 오늘 하늘에 어떤 이야기가 있는지 볼게요.",
    picked: { fandom: "덕질 얘기부터 궁금했군요.", luck: "챙길 것부터 볼까요?" },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이에요.`,
    gradeNotes: {
      "쉬어 가는 날": "미뤄도 되는 약속은 날짜를 옮겨요. 따뜻한 거 마실 시간도 있어야죠.",
      "조심하면 괜찮은 날": "말하기 전에 한 번만 더 생각해 봐요. 그럼 괜찮을 거예요.",
      "무난한 날": "오늘은 편하게 흘러가요. 밥 잘 챙겨 먹고 하던 대로 해요.",
      "좋은 날": "하던 일이 술술 풀릴 거예요. 오늘은 마음 편히 가도 돼요.",
      "아주 좋은 날": "망설이던 일, 오늘 첫발을 떼 봐요. 시작한 다음의 기분도 궁금하네요.",
    },
    people: {
      high: "오늘은 선배가 먼저 손 내밀 수도 있어요. 웃으며 받아 줘요.",
      mid: "친한 사람이랑은 편하게 만나요. 처음 보는 자리는 일찍 일어나도 괜찮아요.",
      low: "오늘은 누구 앞에서든 한 박자 쉬고 말해 봐요. 듣는 쪽이어도 괜찮아요.",
    },
    fandom: {
      high: {
        low: "혼자 깊이 보기 좋은 날이에요. 지난 무대 직캠 보고 좋은 장면 저장해 둬요.",
        mid: "두고두고 생각난 무대가 있나요? 그날의 기분을 글로 남겨 봐요.",
        high: "덕질 친구랑 직캠 같이 보면서 실컷 얘기해요. 오늘은 그래도 돼요.",
      },
      mid: {
        low: "혼자 조용히 해요. 출석 체크하고 사진 한 장만 저장해 둬요.",
        mid: "댓글에 좋았던 순간을 적어 봐요. 짧아도 마음은 전해져요.",
        high: "만나면 좋아하는 장면 하나씩 보여 줘요. 그 정도가 딱 좋아요.",
      },
      low: {
        low: "오늘은 쉬면서 해요. 갖고 있는 포카 정리하면 마음이 편할 거예요.",
        mid: "출석 체크만 하고 쉬어요. 그것도 덕질이에요.",
        high: "친구가 아껴 둔 직캠을 같이 봐요. 다 보고 나면 차 한 잔 어때요?",
      },
    },
    money: {
      high: "돈 흐름이 좋아요. 받을 돈 있으면 오늘 챙겨요.",
      mid: "돈은 평소처럼 써요. 살 건 하룻밤 자고 정해요.",
      low: "돈은 아끼는 날이에요. 굿즈는 장바구니에만 담아 둬요.",
    },
    time: (hour, say) => `${say ? "할 말은" : "부탁은"} ${hour}가 좋아요.`,
    item: (color) => `${color}색 물건 하나 챙겨요.`,
    choice: {
      peopleRest: "약속은 누구랑?",
      peopleCareful: "누구한테 말할 때?",
      peopleFirst: "먼저 말 걸어도 돼?",
      peopleAlso: "사람 쪽도 괜찮을까?",
      peoplePlan: "약속 잡아도 돼?",
      peopleHelper: "누가 도와줄까?",
      fandomFirst: "덕질 먼저 봐 줘",
      fandomSolo: "혼자 덕질할까?",
      fandomAfter: "일찍 와서 덕질해?",
      fandomFriend: "친구도 만날까?",
      whenSay: "할 말은 언제 해?",
      whenAsk: "부탁은 언제 해?",
      luckFirst: "나갈 때 뭘 챙겨?",
      bringInstead: "대신 뭘 챙길까?",
      bringThen: "그럼 뭘 챙길까?",
      bringMore: "운 더 올리려면?",
    },
  },
  yuna: {
    enter: (who) => `${who}오늘 운세, 돌려 말 안 하고 읽어 줄게.`,
    birth: (who) => `${who}네 생일부터 알려 줘. 한 번만 하면 돼.`,
    calc: "네 생일은 기억해. 오늘 하늘 하나씩 짚어 볼게.",
    picked: { fandom: "덕질부터 볼게.", luck: "챙길 것부터 볼게." },
    scoreLine: (score, grade) => `${score}점, ${grade}이야.`,
    gradeNotes: {
      "쉬어 가는 날": "오늘은 쉬는 게 맞아. 약속은 하나면 충분해.",
      "조심하면 괜찮은 날": "답장은 한 번 더 읽고 보내. 오늘 실수는 거기서 나와.",
      "무난한 날": "특별한 건 없어. 하던 대로 하면 돼.",
      "좋은 날": "하던 일이 잘 풀려. 미루던 거 지금 해.",
      "아주 좋은 날": "미뤄 둔 일 꺼내 봐. 오늘 끝낼 수 있는 것부터.",
    },
    people: {
      high: "윗사람이 먼저 손 내밀 수도 있어. 반갑게 받아 주면 돼.",
      mid: "아는 사람은 괜찮아. 처음 보는 자리는 짧게 끝내.",
      low: "오늘은 누구 앞에서든 말을 덜어 내. 듣는 쪽이 편해.",
    },
    fandom: {
      high: {
        low: "혼자 파기 좋은 날이야. 지난 무대 직캠 보고 좋은 장면은 저장해.",
        mid: "다시 보고 싶었던 무대가 있다면 어느 대목이 좋았는지 글로 남겨.",
        high: "덕질 친구 만나. 직캠 같이 보면서 실컷 떠들어.",
      },
      mid: {
        low: "혼자 해. 출석 체크하고 사진 한 장 저장하면 돼.",
        mid: "댓글엔 가장 기억에 남는 장면을 적어.",
        high: "만나면 좋아하는 장면 하나씩만 보여 줘.",
      },
      low: {
        low: "혼자 쉬어. 새로 찾지 말고 갖고 있는 포카만 정리해.",
        mid: "출석 체크만 하고 쉬어. 그걸로 충분해.",
        high: "만나면 친구가 기다리던 직캠부터 봐. 나머지는 다음으로 넘겨.",
      },
    },
    money: {
      high: "돈 흐름은 좋아. 받을 돈 있으면 오늘 받아.",
      mid: "돈은 평소 예산 안에서 써. 장바구니에 담은 것 중 제일 자주 쓸 걸 골라.",
      low: "돈은 아껴. 굿즈는 장바구니까지만.",
    },
    time: (hour, say) => `${say ? "할 말은" : "부탁은"} ${hour}에 하면 돼.`,
    item: (color) => `${color}색 물건을 챙겨. 들고 다니기 편한 걸로.`,
    choice: {
      peopleRest: "약속은 누구랑 잡아?",
      peopleCareful: "누구 답장 조심해?",
      peopleFirst: "먼저 연락해도 돼?",
      peopleAlso: "사람 쪽은?",
      peoplePlan: "약속 잡아도 돼?",
      peopleHelper: "누가 도와줘?",
      fandomFirst: "덕질부터 알려 줘",
      fandomSolo: "혼자 덕질해?",
      fandomAfter: "끝내고 덕질해?",
      fandomFriend: "친구도 만나?",
      whenSay: "할 말은 언제 해?",
      whenAsk: "부탁은 언제 해?",
      luckFirst: "나갈 때 뭐 챙겨?",
      bringInstead: "대신 뭐 챙겨?",
      bringThen: "그럼 뭐 챙겨?",
      bringMore: "더 올릴 방법은?",
    },
  },
  dosa: {
    enter: (who) => `${who}구름 위까지 왔구려. 오늘 운세를 보겠소?`,
    birth: (who) => `${who}운세를 보려면 생일을 알아야 하오. 한 번만 알려 주시오.`,
    calc: "그대 생일은 기억하오. 잠시 하늘을 살피리다.",
    picked: { fandom: "덕질부터 묻는구려.", luck: "챙길 것부터 묻는구려." },
    choice: {
      peopleRest: "사람 만나도 돼요?",
      peopleCareful: "누굴 살필까요?",
      peopleFirst: "먼저 다가가도 돼요?",
      peopleAlso: "사람 운은요?",
      peoplePlan: "약속 잡아도 돼요?",
      peopleHelper: "누가 도와줘요?",
      fandomFirst: "덕질 운부터요",
      fandomSolo: "혼자 덕질할까요?",
      fandomAfter: "돌아와 덕질해요?",
      fandomFriend: "친구도 만날까요?",
      whenSay: "할 말은 언제 해요?",
      whenAsk: "부탁은 언제요?",
      luckFirst: "나설 때 뭘 챙겨요?",
      bringInstead: "대신 뭘 챙겨요?",
      bringThen: "그럼 뭘 챙겨요?",
      bringMore: "더 올리려면요?",
    },
    scoreLine: (score, grade) => `오늘은 ${score}점, ${grade}이구려.`,
    people: {
      high: "손윗사람이 먼저 손을 내밀 수도 있소. 반갑게 맞으시오.",
      mid: "아는 이와는 편하오. 처음 보는 자리는 짧게 머무시오.",
      low: "오늘은 누구 앞에서든 말을 아끼시오. 듣는 쪽이 편하오.",
    },
    fandom: {
      high: {
        low: "홀로 깊이 즐기기 좋은 날이오. 지난 무대 직캠을 보고 좋은 장면을 간직하시오.",
        mid: "응원 글을 정성껏 하나 쓰시오. 오늘은 마음이 잘 닿소.",
        high: "덕질 벗과 직캠을 함께 보며 실컷 이야기하시오.",
      },
      mid: {
        low: "홀로 조용히 즐기시오. 출석하고 사진 한 장만 간직하면 되오.",
        mid: "응원 댓글 하나면 족하오.",
        high: "벗을 만나거든 좋아하는 장면을 하나씩 나누시오.",
      },
      low: {
        low: "홀로 쉬어 가시오. 새로 찾기보다 가진 포카를 정리하시오.",
        mid: "출석만 하고 쉬어도 족하오.",
        high: "만나더라도 덕질 이야기는 짧게 하시오. 직캠은 하나만 함께 보시오.",
      },
    },
    money: {
      high: "돈 흐름이 순하오. 받을 돈이 있거든 오늘 챙기시오.",
      mid: "돈은 평소대로 쓰시오. 살 것은 하룻밤 두고 정하시오.",
      low: "돈은 아끼시오. 장바구니는 내일까지 두시오.",
    },
    time: (hour, say) => (say ? `할 말은 ${hour}에 하시오.` : `${hour}가 청하기 좋소.`),
    item: (color, afterTime) => (afterTime ? `${color}빛 물건도 챙기시오.` : `${color}빛 물건 하나를 챙기시오.`),
    gradeNotes: {
      "쉬어 가는 날": "오늘은 걸음을 늦추고 쉬어 가시오.",
      "조심하면 괜찮은 날": "한 번만 더 살피면 무난히 지나가기 쉽소.",
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
  const who = nickname && !nickname.endsWith("…")
    ? character === "dosa"
      ? `${nickname} 님, `
      : `${nickname}, `
    : "";
  return tones[character][mode](who);
}

/**
 * 지금 대사 아래에 둘 선택지. next = 다음 이야기로 가는 강조 버튼, skip = 한 이야기를 건너뛰는 버튼.
 * 마지막 정리로 가는 버튼(3/4 건너뛰기, 4/4)은 null — 공통 글자(chemi.json dailySummary)를 쓴다.
 */
export function fortuneChoiceKey(
  talk: 1 | 2 | 3 | 4,
  slot: "next" | "skip",
  input: FortuneLineInput,
): FortuneChoiceKey | null {
  const people = band(input.people);
  if (talk === 1) {
    if (slot === "skip") return "fandomFirst";
    if (input.grade === "쉬어 가는 날") return "peopleRest";
    if (input.grade === "조심하면 괜찮은 날") return people === "high" ? "peopleFirst" : "peopleCareful";
    if (people === "mid") return "peoplePlan";
    return people === "high" && brightGrades.includes(input.grade) ? "peopleHelper" : "peopleAlso";
  }
  if (talk === 2) {
    if (slot === "next") return ({ low: "fandomSolo", mid: "fandomAfter", high: "fandomFriend" } as const)[people];
    if (!input.luckyHour) return "luckFirst";
    return people === "low" ? "whenSay" : "whenAsk";
  }
  if (talk === 3 && slot === "next")
    return ({ low: "bringInstead", mid: "bringThen", high: "bringMore" } as const)[band(input.money)];
  return null;
}

/** 한국어 화면의 선택지 글자(최애 말투). 다른 언어는 같은 키의 공통 글자(chemi.json fortuneAsk_*)를 쓴다. */
export function fortuneChoiceLabel(
  character: FortuneCharacterId,
  talk: 1 | 2 | 3 | 4,
  slot: "next" | "skip",
  input: FortuneLineInput,
) {
  const key = fortuneChoiceKey(talk, slot, input);
  return key && tones[character].choice[key];
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
  /** 4/4 로 오면서 누른 선택지. 결과 화면·공유 카드의 한마디처럼 선택지 없이 부르면 시간부터 말한다. */
  asked?: FortuneChoiceKey | null,
) {
  const tone = tones[character];
  if (talk === 1) {
    const note = tone.gradeNotes?.[input.grade] ?? (headline ? `${headline}.` : gradeNotes[input.grade] ?? "");
    return note || tone.scoreLine(input.score, input.grade);
  }
  if (talk === 2) return tone.people[band(input.people)];
  if (talk === 3) {
    // 2/4(사람)를 건너뛰고 왔으면 만남을 전제하지 않는 가운데 줄을 쓴다.
    const fandom = tone.fandom[band(input.fandom)][picked === "fandom" ? "mid" : band(input.people)];
    return `${picked === "fandom" ? `${tone.picked.fandom} ` : ""}${fandom} ${tone.money[band(input.money)]}`;
  }
  const hour = hourText(input.luckyHour);
  // 행운 시간이 있으면 선택지에 바로 답하는 줄이라 받아 주는 말을 붙이지 않는다.
  if (!hour) return `${picked === "luck" ? `${tone.picked.luck} ` : ""}${tone.item(input.color, false)}`;
  if (asked?.startsWith("bring")) return `${tone.item(input.color, false)} ${tone.time(hour, false)}`;
  return `${tone.time(hour, asked === "whenSay")} ${tone.item(input.color, true)}`;
}
