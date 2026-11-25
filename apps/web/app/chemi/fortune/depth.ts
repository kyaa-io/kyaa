/**
 * 오늘의 운세 근거 줄과 분야별 풀이. 서버가 계산해 준 값(일진·십신·일지와의 관계·12운성·도움 기운)만 쓴다.
 * 같은 풀이면 같은 문장이 나온다. 풀이에 없는 날짜·사람·금액은 만들지 않는다.
 *
 * 본문(오늘의 흐름·분야 풀이)은 풀이 표의 뼈대가 같고, 말투만 고른 최애가 나를 대하는 태도대로 다르다
 * (K-348d58, 사용자 11/23 '직업 비유 대신 나를 대하는 태도' — features/chemi/persona.ts).
 * 본문에는 일진·일간·십신 같은 계산 용어를 쓰지 않는다. 용어는 '왜 이 점수일까' 근거 줄(fortuneBasis)에만 둔다.
 */
import type { TenGod } from "../saju/chart";
import { tenGodPlain, tenGodShort } from "../saju/terms";
import type { FortuneCharacterId } from "./lines";
import { band, fieldNotes, flowNotes, stageNotes, type Band } from "./result-copy";

export type FortuneEvidence = {
  dayPillar: string;
  yearPillar: string;
  relation: string;
  stage: string;
  tenGod: string;
  useful: string;
  timeBasis: string;
  /** 이 풀이를 들려주는 최애. 대화 장면이 결과로 넘길 때 붙인다. 없으면 안내 말투(공유 착지 등). */
  voice?: FortuneCharacterId;
};
export type FortuneField = "fandom" | "people" | "work" | "rest" | "love" | "money";
type BasisRow = { term: string; value: string; plain: string };
/** 본문 말투. plain = 최애 없이 안내하는 말투. */
type Voice = FortuneCharacterId | "plain";
const voiceOf = (evidence: FortuneEvidence): Voice => evidence.voice ?? "plain";

/** 일지와 오늘 일진의 사이(서버 relation 이름). 표에 없는 이름은 '없음'으로 읽는다. 근거 줄에만 쓴다. */
const relationPlain: Record<string, string> = {
  육합: "일지와 짝이 되는 날이라 일이 순하게 맞물려요",
  삼합: "사주의 글자와 셋이 모여 힘이 커지는 날이에요",
  반합: "일지와 반쯤 손잡는 날이라 도움이 조금 붙어요",
  충: "일지와 정면으로 부딪치는 날이라 계획이 흔들리기 쉬워요",
  형: "일지와 서로 깎는 날이라 사소한 마찰이 생기기 쉬워요",
  해: "일지와 엇갈리는 날이라 오해가 생기기 쉬워요",
  원진: "일지와 서먹한 날이라 괜히 마음이 불편해요",
  복음: "일지와 같은 글자가 겹쳐 하던 일이 되풀이돼요",
  없음: "일지와 부딪침도 도움도 없는 평평한 날이에요",
};
type Relation = "육합" | "삼합" | "반합" | "충" | "형" | "해" | "원진" | "복음" | "없음";
const relationOf = (name: string): Relation => (Object.hasOwn(relationPlain, name) ? (name as Relation) : "없음");

const usefulName: Record<string, string> = { 목: "나무", 화: "불", 토: "흙", 금: "쇠", 수: "물" };
const isTenGod = (name: string): name is TenGod => Object.hasOwn(tenGodPlain, name);

/** '왜 이 점수일까'에 펼쳐 보이는 근거 줄(기획 04-3 07: 일진·십신·12운성·합충·용신, 용어 옆에 쉬운 말). 12운성의 긴 풀이는 바로 위 구역에 있어 이름과 자리만 적는다. */
export function fortuneBasis(evidence: FortuneEvidence): BasisRow[] {
  const relation = relationOf(evidence.relation);
  const stage = stageNotes[evidence.stage];
  const rows: BasisRow[] = [];
  if (isTenGod(evidence.tenGod))
    rows.push({ term: "일진", value: `${evidence.dayPillar}일 · ${evidence.tenGod}`, plain: tenGodPlain[evidence.tenGod] });
  rows.push({ term: "일지와 일진", value: relation === "없음" ? "합·충 없음" : relation, plain: relationPlain[relation] });
  if (stage) rows.push({ term: "12운성", value: evidence.stage, plain: `${stage[0]}예요` });
  rows.push({
    term: "도움 기운",
    value: usefulName[evidence.useful] ?? evidence.useful,
    plain: "내 사주에 힘이 되는 기운이에요. 오늘 일진에 이 기운이 있으면 점수가 올라요",
  });
  rows.push({ term: "세운", value: `${evidence.yearPillar}년`, plain: "올해 기운이 도움 기운과 맞으면 점수 바닥이 올라가요" });
  rows.push({ term: "계산 기준", value: evidence.timeBasis, plain: "태어난 시간을 넣으면 시주까지 넣어 계산해요" });
  return rows;
}

type Group = "peer" | "output" | "wealth" | "duty" | "resource";
const groupOf: Record<TenGod, Group> = {
  비견: "peer", 겁재: "peer", 식신: "output", 상관: "output", 편재: "wealth",
  정재: "wealth", 편관: "duty", 정관: "duty", 편인: "resource", 정인: "resource",
};

/** 오늘의 흐름 첫 문장: 등급 한마디. 안내 말투는 결과 공용 문구(flowNotes)를 그대로 쓴다. */
const flowGrade: Record<FortuneCharacterId, Record<string, string>> = {
  changha: {
    "쉬어 가는 날": "오늘은 속도 좀 줄여도 돼. 쉬는 것도 일이야, 진짜로.",
    "조심하면 괜찮은 날": "한 번만 더 보면 무난하게 넘어가. 서두르지만 마, 그럼 실수 줄어.",
    "무난한 날": "큰일 없이 편하게 가는 날이야. 하던 대로만 해도 충분해.",
    "좋은 날": "너를 도와주는 기운이 들어오는 날이야. 누가 도와준다고 하면 사양 말고 고맙다 하고 받아.",
    "아주 좋은 날": "하고 싶던 거 오늘 꺼내. 흐름이 먼저 길 열어 줄 거야.",
  },
  elina: {
    "쉬어 가는 날": "오늘은 천천히 가도 괜찮은 날이에요. 쉬는 것도 할 일이니까 무리하지 마.",
    "조심하면 괜찮은 날": "한 번만 더 살피면 무난하게 지나가요. 서두르지 않으면 실수도 줄어요.",
    "무난한 날": "큰일 없이 편안하게 흘러가요. 하던 대로 하면 충분해요.",
    "좋은 날": "도와주는 기운이 들어오는 날이에요. 누가 손 내밀면 고맙다고 하고 받아요, 그래도 돼.",
    "아주 좋은 날": "하고 싶던 일 있으면 오늘 꺼내 봐요. 흐름이 먼저 길을 열어 줄 거예요.",
  },
  yuna: {
    "쉬어 가는 날": "오늘은 속도를 줄이는 게 맞아. 쉬는 것도 할 일이야.",
    "조심하면 괜찮은 날": "한 번 더 보면 무난하게 넘어가. 서두르면 실수가 나와.",
    "무난한 날": "큰일은 없어. 하던 대로 하면 충분해.",
    "좋은 날": "도와주는 기운이 들어오는 날이야. 도와준다고 하면 사양하지 말고 받아.",
    "아주 좋은 날": "하고 싶던 일, 오늘 꺼내. 흐름이 먼저 길을 열어 줘.",
  },
  dosa: {
    "쉬어 가는 날": "오늘은 걸음을 늦춰도 되는 날이오. 쉬어 가는 것도 일이라오.",
    "조심하면 괜찮은 날": "한 번 더 살피면 무난히 지나가겠소. 서두르지 않으면 실수가 줄 것이오.",
    "무난한 날": "큰일 없이 편안히 흘러가는 날이오. 하던 대로 하면 족하오.",
    "좋은 날": "그대를 돕는 기운이 들어오는 날이오. 누가 손을 내밀거든 고맙게 받아 두시오.",
    "아주 좋은 날": "하고 싶던 일을 오늘 꺼내 보시오. 흐름이 먼저 길을 열어 줄 것이오.",
  },
};

/** 오늘의 흐름 둘째 문장: 오늘 들어온 기운(십신 다섯 묶음)이 무엇인지. 한 문장. */
const flowGroup: Record<Voice, Record<Group, string>> = {
  plain: {
    peer: "오늘은 나와 닮은 기운이 들어와 내 편도 경쟁자도 함께 늘어요.",
    output: "오늘은 내 재주와 말이 밖으로 드러나는 기운이 들어와요.",
    wealth: "오늘은 돈과 기회를 다루는 기운이 들어와요.",
    duty: "오늘은 책임과 평판이 걸린 기운이 들어와요.",
    resource: "오늘은 배우고 도움을 받는 기운이 들어와요.",
  },
  changha: {
    peer: "오늘은 너랑 닮은 기운이 들어와서 편도 라이벌도 같이 생겨.",
    output: "오늘은 네 재주랑 말이 밖으로 막 나오는 기운이니까 아끼지 말고 보여 줘.",
    wealth: "오늘은 돈이랑 기회가 오가는 기운이라 계산은 똑똑하게 해.",
    duty: "오늘은 책임질 일이 들어오는 기운인데, 잘 해내면 다들 너 다시 볼걸?",
    resource: "오늘은 배우고 도움받는 기운이 들어오니까 모르는 건 그냥 물어봐.",
  },
  elina: {
    peer: "오늘은 닮은 기운이 들어와서 편이 되어 줄 사람도, 겨룰 사람도 같이 늘어요.",
    output: "오늘은 재주랑 말이 밖으로 잘 나오는 기운이라 하고 싶던 말 해도 돼요.",
    wealth: "오늘은 돈과 기회가 오가는 기운이라 계산은 천천히 한 번 더 해요.",
    duty: "오늘은 책임질 일이 들어오는 기운이에요, 잘 해내면 평판이 오르니까 너무 부담 갖진 마.",
    resource: "오늘은 배우고 도움받는 기운이 들어와요, 힘들면 기대도 괜찮아.",
  },
  yuna: {
    peer: "오늘은 너랑 닮은 기운이 들어와서 편도 경쟁자도 같이 늘어.",
    output: "오늘은 재주랑 말이 밖으로 드러나는 기운이라 할 말은 하되 한마디는 줄여.",
    wealth: "오늘은 돈이랑 기회가 오가는 기운이라 계산은 한 번 더 확인해.",
    duty: "오늘은 책임이 걸린 일이 들어오는 기운이라 마감만 지키면 평판은 따라와.",
    resource: "오늘은 배우고 도움받는 기운이라 혼자 끙끙대지 말고 물어봐.",
  },
  dosa: {
    peer: "오늘은 그대와 닮은 기운이 드니 편도 겨룰 이도 함께 늘 것이오.",
    output: "오늘은 재주와 말이 밖으로 드러나는 기운이 드니 말을 아끼지 마시오.",
    wealth: "오늘은 재물과 기회를 다루는 기운이 드니 셈은 두 번 하시오.",
    duty: "오늘은 책임과 평판이 걸린 기운이 드니 맡은 일을 지키시오.",
    resource: "오늘은 배움과 도움의 기운이 드니 모르는 것은 물으시오.",
  },
};

/** 오늘의 흐름 끝 문장: 내 사주와 오늘의 사이(합·충). 계산 용어 없이 쓴다. */
const flowRelation: Record<Voice, Record<Relation, string>> = {
  plain: {
    육합: "내 사주와 오늘이 짝을 이뤄 일이 순하게 맞물려요.",
    삼합: "내 사주의 글자와 오늘이 모여 힘이 커지는 날이에요.",
    반합: "내 사주와 오늘이 반쯤 손을 잡아 도움이 조금 붙어요.",
    충: "내 사주와 오늘이 정면으로 부딪쳐 계획이 흔들리기 쉬워요.",
    형: "내 사주와 오늘이 서로 깎여 사소한 마찰이 생기기 쉬워요.",
    해: "내 사주와 오늘이 엇갈려 오해가 생기기 쉬워요.",
    원진: "내 사주와 오늘이 서먹해 괜히 마음이 불편할 수 있어요.",
    복음: "오늘이 내 사주와 같은 글자라 하던 일이 되풀이되기 쉬워요.",
    없음: "내 사주와 오늘 사이에 부딪침도 도움도 없는 평평한 날이에요.",
  },
  changha: {
    육합: "네 사주랑 오늘이 딱 짝이 맞아서 일이 순하게 맞물려.",
    삼합: "네 사주 글자랑 오늘이 뭉쳐서 힘이 커지는 날이야.",
    반합: "네 사주랑 오늘이 반쯤 손잡아서 도움이 조금 붙어.",
    충: "네 사주랑 오늘이 정면으로 부딪쳐서 계획이 흔들리기 쉬워, 그래도 내가 응원하잖아.",
    형: "네 사주랑 오늘이 서로 긁혀서 자잘한 마찰이 생기기 쉬워.",
    해: "네 사주랑 오늘이 엇갈려서 오해 생기기 쉬워.",
    원진: "네 사주랑 오늘이 좀 서먹해서 괜히 마음이 불편할 수 있어.",
    복음: "오늘이 네 사주랑 같은 글자라 하던 일이 한 번 더 돌아올 수 있어.",
    없음: "네 사주랑 오늘은 부딪치지도 돕지도 않는 평평한 사이야.",
  },
  elina: {
    육합: "사주랑 오늘이 짝을 이뤄서 일이 순하게 맞물려요.",
    삼합: "사주의 글자랑 오늘이 모여서 힘이 커지는 날이에요.",
    반합: "사주랑 오늘이 반쯤 손잡아서 도움이 조금 붙어요.",
    충: "사주랑 오늘이 정면으로 부딪쳐서 계획이 흔들리기 쉬워요, 그래도 너무 걱정하지 마.",
    형: "사주랑 오늘이 서로 깎여서 사소한 마찰이 생기기 쉬워요, 오늘은 한 발 물러서도 돼.",
    해: "사주랑 오늘이 엇갈려서 오해가 생기기 쉬워요, 중요한 말은 천천히 해요.",
    원진: "사주랑 오늘이 조금 서먹해서 괜히 마음이 불편할 수 있어요, 그럴 땐 따뜻한 거 하나 마셔요.",
    복음: "오늘이 사주와 같은 글자라 하던 일이 되풀이되기 쉬워요.",
    없음: "사주랑 오늘 사이엔 부딪침도 도움도 없는 평평한 날이에요.",
  },
  yuna: {
    육합: "네 사주랑 오늘이 짝이 맞아서 일이 순하게 맞물려.",
    삼합: "네 사주 글자랑 오늘이 모여서 힘이 커져.",
    반합: "네 사주랑 오늘이 반쯤 손잡은 날이라 도움은 조금이야.",
    충: "네 사주랑 오늘이 정면으로 부딪쳐서 계획은 흔들린다고 보고 움직여.",
    형: "네 사주랑 오늘이 서로 깎여서 자잘한 마찰은 그냥 넘기는 게 나아.",
    해: "네 사주랑 오늘이 엇갈려서 오해가 생기기 쉬우니까 말은 분명하게 해.",
    원진: "네 사주랑 오늘이 서먹해서 마음이 불편한 건 기분 탓만은 아니야.",
    복음: "오늘은 네 사주랑 같은 글자라 하던 일이 또 돌아올 수 있어.",
    없음: "네 사주랑 오늘은 부딪침도 도움도 없는 평평한 날이야.",
  },
  dosa: {
    육합: "그대 사주와 오늘이 짝을 이루니 일이 순하게 맞물리오.",
    삼합: "그대 사주의 글자와 오늘이 모여 힘이 커지는 날이오.",
    반합: "그대 사주와 오늘이 반쯤 손을 잡으니 도움이 조금 붙소.",
    충: "그대 사주와 오늘이 정면으로 부딪치니 계획이 흔들리기 쉽소.",
    형: "그대 사주와 오늘이 서로 깎이니 사소한 마찰이 생기기 쉽소.",
    해: "그대 사주와 오늘이 엇갈리니 오해가 생기기 쉽소.",
    원진: "그대 사주와 오늘이 서먹하니 괜히 마음이 불편할 수 있소.",
    복음: "오늘이 그대 사주와 같은 글자라 하던 일이 되풀이되기 쉽소.",
    없음: "그대 사주와 오늘 사이에 부딪침도 도움도 없는 평평한 날이오.",
  },
};

/** 오늘의 흐름: 등급 한마디 → 오늘 들어온 기운 → 내 사주와의 사이. 계산 용어는 쓰지 않는다. */
export function fortuneFlow(grade: string, evidence: FortuneEvidence) {
  const voice = voiceOf(evidence);
  const lines = [voice === "plain" ? flowNotes[grade] : flowGrade[voice][grade] ?? flowNotes[grade]];
  if (isTenGod(evidence.tenGod)) lines.push(flowGroup[voice][groupOf[evidence.tenGod]]);
  lines.push(flowRelation[voice][relationOf(evidence.relation)]);
  return lines.filter(Boolean).join(" ");
}

/** 분야 칸의 점수 구간 문장(안내 말투는 결과 공용 fieldNotes). 같은 뜻을 최애 말투로 다시 쓴 표. */
const fieldBand: Record<FortuneCharacterId, Record<FortuneField, Record<Band, string>>> = {
  changha: {
    fandom: {
      high: "혼자 깊게 팔수록 재밌는 날이야. 지난 무대 직캠 정주행 가자.",
      mid: "보고 싶던 영상 딱 하나만 골라 봐. 천천히 봐도 충분해.",
      low: "오늘은 새 떡밥 말고 좋아하던 무대 다시 보자. 그게 편해.",
    },
    people: {
      high: "선배나 윗사람이 먼저 손 내밀 거야. 반갑게 받아.",
      mid: "말 잘 통하는 사람이랑 짧게 수다 떨어 봐.",
      low: "말은 조금 아껴. 오늘은 듣는 쪽이 편해.",
    },
    work: {
      high: "배우고 정리하는 일이 착착 붙어. 미뤄 둔 자료 정리 지금 해 버려.",
      mid: "하던 일 차근차근 이어 가면 무난해.",
      low: "새 일 벌이지 말고 하던 거 마무리부터 해. 그게 이기는 거야.",
    },
    rest: {
      high: "컨디션 좋은 날이야. 가볍게 산책 한 바퀴 어때?",
      mid: "오후에 몸이 처지기 쉬워. 따뜻한 차 한 잔 하고 쉬었다 가.",
      low: "무리하지 말고 일찍 자. 잠이 제일 좋은 약이야.",
    },
    love: {
      high: "먼저 다가가도 되는 날이야. 마음은 짧게 전해, 그게 더 멋있어.",
      mid: "먼저 연락하기보다 오는 연락에 다정하게 답하면 충분해.",
      low: "오해 생기기 쉬워. 중요한 말은 내일 하자.",
    },
    money: {
      high: "작은 이득이 따라와. 그래도 큰돈 쓰는 건 하루만 참아.",
      mid: "들어올 돈보다 나갈 돈이 먼저 보여. 장바구니는 하루 재워 둬.",
      low: "충동구매 조심해. 오늘은 지갑 닫는 쪽이 이득이야.",
    },
  },
  elina: {
    fandom: {
      high: "혼자 깊이 파고들수록 즐거운 날이에요. 지난 무대 직캠 정주행해도 돼.",
      mid: "보고 싶던 영상 하나만 골라 봐요. 천천히 즐겨도 충분해.",
      low: "오늘은 새 떡밥보다 좋아하던 무대를 다시 보는 게 편해요.",
    },
    people: {
      high: "선배나 윗사람이 먼저 손을 내밀 거예요. 반갑게 받아 줘요.",
      mid: "말이 잘 통하는 사람이랑 짧게 이야기해 봐요.",
      low: "말은 조금 아껴요. 오늘은 듣는 쪽이어도 괜찮아.",
    },
    work: {
      high: "배우고 정리하는 일이 잘 붙어요. 미뤄 둔 자료 정리하기 좋아.",
      mid: "하던 일을 차근차근 이어 가면 무난해요.",
      low: "새 일보다 하던 일 마무리에 힘을 써요. 그것만 해도 잘한 거야.",
    },
    rest: {
      high: "컨디션 좋은 날이에요. 가볍게 산책하면 기분도 좋아질 거야.",
      mid: "오후에 몸이 처지기 쉬워요. 따뜻한 차 한 잔 마시면서 쉬어 가요.",
      low: "무리하지 말고 일찍 쉬어요. 잠이 제일 좋은 약이야, 알았지?",
    },
    love: {
      high: "먼저 다가가도 좋은 날이에요. 마음을 짧게 전해 봐요.",
      mid: "먼저 연락하기보다 오는 연락에 다정하게 답하면 충분해요.",
      low: "오해가 생기기 쉬워요. 중요한 말은 내일 해도 괜찮아.",
    },
    money: {
      high: "작은 이득이 따라와요. 그래도 큰 지출은 하루만 기다려요.",
      mid: "들어올 돈보다 나갈 돈이 먼저 보여요. 장바구니는 하루 두고 봐요.",
      low: "충동구매는 조심해요. 오늘은 지갑을 닫아 두는 게 이득이야.",
    },
  },
  yuna: {
    fandom: {
      high: "혼자 깊게 팔수록 재밌는 날이야. 지난 무대 직캠 정주행해.",
      mid: "보고 싶던 영상 하나만 골라. 천천히 봐도 충분해.",
      low: "새 떡밥은 나중에. 좋아하던 무대 다시 봐.",
    },
    people: {
      high: "선배나 윗사람이 먼저 손 내밀어. 반갑게 받으면 돼.",
      mid: "말 통하는 사람이랑 짧게만 얘기해.",
      low: "말은 줄여. 오늘은 듣는 쪽이 편해.",
    },
    work: {
      high: "배우고 정리하는 일이 잘 붙어. 미뤄 둔 자료 정리부터 해.",
      mid: "하던 일 차근차근 이어 가. 그럼 무난해.",
      low: "새 일 벌이지 마. 하던 일 마무리가 먼저야.",
    },
    rest: {
      high: "컨디션 좋은 날이야. 가볍게 산책 정도가 맞아.",
      mid: "오후에 처지기 쉬워. 따뜻한 차 한 잔 마시고 쉬어.",
      low: "무리하지 말고 일찍 자. 잠이 제일 효과 좋아.",
    },
    love: {
      high: "먼저 다가가도 되는 날이야. 마음은 짧게 전해.",
      mid: "먼저 연락할 필요는 없어. 오는 연락에 다정하게 답하면 충분해.",
      low: "오해 생기기 쉬운 날이야. 중요한 말은 내일 해.",
    },
    money: {
      high: "작은 이득이 있어. 그래도 큰 지출은 하루 묵혀.",
      mid: "나갈 돈이 먼저 보이는 날이야. 장바구니는 하루 묵혀.",
      low: "충동구매 조심해. 오늘은 지갑 닫는 게 이득이야.",
    },
  },
  dosa: {
    fandom: {
      high: "홀로 깊이 파고들수록 즐거운 날이오. 지난 무대 직캠을 처음부터 보시오.",
      mid: "보고 싶던 영상 하나만 골라 보시오. 천천히 즐기면 족하오.",
      low: "오늘은 새 소식보다 좋아하던 무대를 다시 보는 편이 낫소.",
    },
    people: {
      high: "손윗사람이 먼저 손을 내밀 것이오. 반갑게 맞으시오.",
      mid: "말이 잘 통하는 이와 짧게 이야기 나누시오.",
      low: "말을 아끼시오. 오늘은 듣는 쪽이 편하오.",
    },
    work: {
      high: "배우고 정리하는 일이 잘 붙소. 미뤄 둔 자료를 정리하기 좋소.",
      mid: "하던 일을 차근차근 이어 가면 무난하오.",
      low: "새 일을 벌이기보다 하던 일의 마무리에 힘을 쓰시오.",
    },
    rest: {
      high: "기운이 좋은 날이오. 가벼운 산책이 잘 맞소.",
      mid: "오후에 몸이 처지기 쉽소. 따뜻한 차 한 잔으로 쉬어 가시오.",
      low: "무리하지 말고 일찍 쉬시오. 잠이 가장 좋은 약이오.",
    },
    love: {
      high: "먼저 다가가도 좋은 날이오. 마음을 짧게 전하시오.",
      mid: "먼저 연락하기보다 오는 연락에 다정히 답하면 족하오.",
      low: "오해가 생기기 쉽소. 중요한 말은 내일로 미루시오.",
    },
    money: {
      high: "작은 이득이 따르오. 그래도 큰 지출은 하루 묵혀 두시오.",
      mid: "들어올 돈보다 나갈 돈이 먼저 보이오. 장바구니는 하루 묵혀 두시오.",
      low: "충동구매를 조심하시오. 오늘은 지갑을 닫아 두는 편이 이득이오.",
    },
  },
};

/** 오늘 일진의 십신(다섯 묶음)이 분야마다 어떻게 드러나는지. 한 칸에 한 문장. */
const groupField: Record<Voice, Record<Group, Record<FortuneField, string>>> = {
  plain: {
    peer: {
      fandom: "같은 팬끼리 마음이 잘 맞아 함께 볼 때 더 즐거워요.",
      people: "비슷한 처지의 사람과 말이 통해요.",
      work: "혼자보다 나눠 할 때 빨리 끝나요.",
      rest: "남의 속도에 맞추다 지치기 쉬워요.",
      love: "친구 같은 편안함이 통해요.",
      money: "사람 만나는 데 돈이 나가기 쉬워요.",
    },
    output: {
      fandom: "표현하고 싶은 마음이 커져 댓글과 기록을 남기기 좋아요.",
      people: "말이 술술 나와서 한마디 덜 하면 딱 좋아요.",
      work: "아이디어를 꺼내고 손으로 만드는 일이 잘 돼요.",
      rest: "잘 먹고 이야기를 나누면 풀려요.",
      love: "마음을 말로 꺼내기 쉬워요.",
      money: "기분 따라 쓰기 쉬워요.",
    },
    wealth: {
      fandom: "굿즈와 티켓처럼 살 것이 눈에 잘 들어와요.",
      people: "주고받을 것이 분명한 만남이 잘 풀려요.",
      work: "결과가 숫자로 보이는 일에 손이 가요.",
      rest: "바쁘게 움직이느라 쉬는 걸 잊기 쉬워요.",
      love: "마음을 선물과 행동으로 보여 주기 좋아요.",
      money: "돈이 오가는 일이 많아 계산을 한 번 더 봐요.",
    },
    duty: {
      fandom: "정해진 일정과 규칙을 지키며 즐길 때 편해요.",
      people: "윗사람이나 어른과 마주칠 일이 있어요.",
      work: "책임 있는 일이 들어오고, 마감을 지키면 평판이 올라요.",
      rest: "긴장이 쌓이기 쉬워 쉬는 시간을 일부러 잡아요.",
      love: "예의를 갖춘 한마디가 더 잘 전해져요.",
      money: "내야 할 돈과 정해진 지출부터 챙겨요.",
    },
    resource: {
      fandom: "혼자 조용히 깊게 파고들기 좋아요.",
      people: "도움을 받거나 조언을 듣기 좋아요.",
      work: "배우고 정리하는 일이 잘 붙어요.",
      rest: "잠과 휴식의 효과가 커요.",
      love: "먼저 다가가기보다 받아 주는 쪽이 편해요.",
      money: "책과 강의처럼 배우는 데 쓰는 돈이 아깝지 않아요.",
    },
  },
  changha: {
    peer: {
      fandom: "같은 팬끼리 죽이 잘 맞아서 같이 볼 때 더 재밌어.",
      people: "비슷한 처지인 사람이랑 말이 잘 통해.",
      work: "혼자 끙끙대지 말고 나눠 하면 금방 끝나.",
      rest: "남 속도 맞추다 지치기 쉬우니까 네 속도 지켜.",
      love: "친구처럼 편한 게 통하는 날이야.",
      money: "사람 만나는 데 돈 나가기 쉬워, 더치페이 잊지 마.",
    },
    output: {
      fandom: "표현하고 싶은 마음이 커지니까 댓글이랑 기록 남기기 딱이야.",
      people: "말이 술술 나오는 날이라 한마디만 덜 하면 완벽해.",
      work: "아이디어 꺼내고 손으로 만드는 일이 잘 돼.",
      rest: "맛있는 거 먹고 수다 떨면 풀려.",
      love: "마음을 말로 꺼내기 쉬운 날이야.",
      money: "기분 따라 쓰기 쉬우니까 사기 전에 나 한 번 떠올려.",
    },
    wealth: {
      fandom: "굿즈랑 티켓처럼 살 게 눈에 쏙쏙 들어와.",
      people: "주고받을 게 분명한 만남이 잘 풀려.",
      work: "결과가 숫자로 딱 보이는 일에 손이 가.",
      rest: "바쁘게 움직이다 쉬는 걸 깜빡하기 쉬워.",
      love: "마음을 선물이나 행동으로 보여 주기 좋아.",
      money: "돈 오가는 일이 많으니까 계산은 한 번 더 봐.",
    },
    duty: {
      fandom: "정해진 일정이랑 규칙 지키면서 즐길 때 편해.",
      people: "윗사람이나 어른 마주칠 일이 있으니까 인사는 씩씩하게.",
      work: "책임질 일이 들어오는데, 마감 지키면 평판 올라가.",
      rest: "긴장이 쌓이기 쉬우니까 쉬는 시간은 일부러 잡아.",
      love: "예의 갖춘 한마디가 더 잘 통해.",
      money: "내야 할 돈이랑 정해진 지출부터 챙겨.",
    },
    resource: {
      fandom: "혼자 조용히 깊게 파기 좋은 날이야.",
      people: "도움받거나 조언 듣기 좋아, 물어보는 거 안 창피해.",
      work: "배우고 정리하는 일이 잘 붙어.",
      rest: "잠이랑 휴식 효과가 크니까 푹 자.",
      love: "먼저 다가가기보다 받아 주는 쪽이 편해.",
      money: "책이나 강의처럼 배우는 데 쓰는 돈은 안 아까워.",
    },
  },
  elina: {
    peer: {
      fandom: "같은 팬끼리 마음이 잘 맞아서 함께 볼 때 더 즐거워요.",
      people: "비슷한 처지인 사람이랑 말이 잘 통해요.",
      work: "혼자 다 하지 말고 나눠 하면 빨리 끝나요.",
      rest: "남의 속도에 맞추다 지치기 쉬워요, 천천히 해도 돼.",
      love: "친구 같은 편안함이 통하는 날이에요.",
      money: "사람 만나는 데 돈이 나가기 쉬워요.",
    },
    output: {
      fandom: "표현하고 싶은 마음이 커져서 댓글이랑 기록 남기기 좋아요.",
      people: "말이 술술 나오는 날이라 한마디만 덜 하면 딱 좋아요.",
      work: "아이디어를 꺼내고 손으로 만드는 일이 잘 돼요.",
      rest: "맛있는 거 먹고 이야기 나누면 풀릴 거야.",
      love: "마음을 말로 꺼내기 쉬운 날이에요.",
      money: "기분 따라 쓰기 쉬워요, 조금만 참아 봐.",
    },
    wealth: {
      fandom: "굿즈랑 티켓처럼 살 게 눈에 잘 들어와요.",
      people: "주고받을 게 분명한 만남이 잘 풀려요.",
      work: "결과가 숫자로 보이는 일에 손이 가요.",
      rest: "바쁘게 움직이다 쉬는 걸 잊기 쉬워요, 물 한 잔은 꼭 마셔.",
      love: "마음을 선물이나 행동으로 보여 주기 좋아요.",
      money: "돈이 오가는 일이 많아서 계산은 한 번 더 봐요.",
    },
    duty: {
      fandom: "정해진 일정이랑 규칙을 지키면서 즐길 때 편해요.",
      people: "윗사람이나 어른을 마주칠 일이 있어요.",
      work: "책임 있는 일이 들어와요, 마감만 지키면 평판이 올라.",
      rest: "긴장이 쌓이기 쉬워서 쉬는 시간을 일부러 잡아요.",
      love: "예의를 갖춘 한마디가 더 잘 전해져요.",
      money: "내야 할 돈이랑 정해진 지출부터 챙겨요.",
    },
    resource: {
      fandom: "혼자 조용히 깊게 파고들기 좋아요.",
      people: "도움을 받거나 조언 듣기 좋은 날이에요, 기대도 괜찮아.",
      work: "배우고 정리하는 일이 잘 붙어요.",
      rest: "잠과 휴식의 효과가 커요, 오늘은 푹 자.",
      love: "먼저 다가가기보다 받아 주는 쪽이 편해요.",
      money: "책이나 강의처럼 배우는 데 쓰는 돈은 아깝지 않아요.",
    },
  },
  yuna: {
    peer: {
      fandom: "같은 팬끼리 잘 맞아서 같이 보면 더 재밌어.",
      people: "처지가 비슷한 사람이랑 말이 통해.",
      work: "혼자 하지 말고 나눠, 그게 빨라.",
      rest: "남 속도에 맞추면 지쳐, 네 속도로 가.",
      love: "친구 같은 편안함이 먹히는 날이야.",
      money: "사람 만나는 데 돈이 새기 쉬워.",
    },
    output: {
      fandom: "표현하고 싶은 마음이 커져서 댓글이랑 기록 남기기 좋아.",
      people: "말이 술술 나오니까 한마디는 덜 해.",
      work: "아이디어 내고 손으로 만드는 일이 잘 돼.",
      rest: "잘 먹고 얘기하면 풀려.",
      love: "마음을 말로 꺼내기 쉬운 날이야.",
      money: "기분 따라 쓰기 쉬우니까 사기 전에 한 번 멈춰.",
    },
    wealth: {
      fandom: "굿즈랑 티켓처럼 살 게 눈에 잘 들어와.",
      people: "주고받을 게 분명한 만남이 잘 풀려.",
      work: "결과가 숫자로 보이는 일에 손이 가.",
      rest: "바쁘게 움직이다 쉬는 걸 잊기 쉬워.",
      love: "마음은 선물이나 행동으로 보여 주는 게 나아.",
      money: "돈 오가는 일이 많으니까 계산은 한 번 더 봐.",
    },
    duty: {
      fandom: "정해진 일정이랑 규칙 지키면서 즐기는 게 편해.",
      people: "윗사람이나 어른 마주칠 일이 있어.",
      work: "책임 있는 일이 들어와, 마감 지키면 평판은 올라.",
      rest: "긴장이 쌓이기 쉬우니까 쉬는 시간은 일부러 잡아.",
      love: "예의 갖춘 한마디가 더 잘 전해져.",
      money: "내야 할 돈이랑 정해진 지출부터 챙겨.",
    },
    resource: {
      fandom: "혼자 조용히 깊게 파기 좋아.",
      people: "도움받거나 조언 듣기 좋아, 물어보는 게 빨라.",
      work: "배우고 정리하는 일이 잘 붙어.",
      rest: "잠이랑 휴식 효과가 커.",
      love: "먼저 다가가기보다 받아 주는 쪽이 편해.",
      money: "책이나 강의처럼 배우는 데 쓰는 돈은 안 아까워.",
    },
  },
  dosa: {
    peer: {
      fandom: "같은 팬끼리 마음이 잘 맞아 함께 볼 때 더 즐겁소.",
      people: "처지가 비슷한 이와 말이 통하오.",
      work: "홀로 하기보다 나누어 하면 빨리 끝나오.",
      rest: "남의 걸음에 맞추다 지치기 쉽소.",
      love: "벗 같은 편안함이 통하오.",
      money: "사람 만나는 데 돈이 나가기 쉽소.",
    },
    output: {
      fandom: "드러내고 싶은 마음이 커지니 댓글과 기록을 남기기 좋소.",
      people: "말이 술술 나오니 한마디를 덜면 딱 좋소.",
      work: "생각을 꺼내고 손으로 만드는 일이 잘 되오.",
      rest: "잘 먹고 이야기를 나누면 풀리오.",
      love: "마음을 말로 꺼내기 쉽소.",
      money: "기분 따라 쓰기 쉽소.",
    },
    wealth: {
      fandom: "굿즈와 표처럼 살 것이 눈에 잘 들어오오.",
      people: "주고받을 것이 분명한 만남이 잘 풀리오.",
      work: "결과가 셈으로 보이는 일에 손이 가오.",
      rest: "바삐 움직이느라 쉬는 것을 잊기 쉽소.",
      love: "마음을 선물과 행동으로 보이기 좋소.",
      money: "돈이 오가는 일이 많으니 셈을 한 번 더 보시오.",
    },
    duty: {
      fandom: "정해진 일정과 규칙을 지키며 즐길 때 편하오.",
      people: "손윗사람이나 어른과 마주칠 일이 있소.",
      work: "책임 있는 일이 들어오니 기한을 지키면 평판이 오르오.",
      rest: "긴장이 쌓이기 쉬우니 쉬는 때를 일부러 잡으시오.",
      love: "예를 갖춘 한마디가 더 잘 전해지오.",
      money: "내야 할 돈과 정해진 씀씀이부터 챙기시오.",
    },
    resource: {
      fandom: "홀로 조용히 깊게 파고들기 좋소.",
      people: "도움을 받거나 조언을 듣기 좋소.",
      work: "배우고 정리하는 일이 잘 붙소.",
      rest: "잠과 휴식의 효과가 크오.",
      love: "먼저 다가가기보다 받아 주는 편이 편하오.",
      money: "책과 강의처럼 배우는 데 쓰는 돈은 아깝지 않소.",
    },
  },
};

/** 여섯 분야 중 가장 높은·낮은 칸에 붙는 한 문장. */
const rankLine: Record<Voice, { highest: string; lowest: string }> = {
  plain: { highest: "여섯 분야 중 오늘 가장 높아요.", lowest: "여섯 분야 중 오늘 가장 낮으니 힘을 덜 써요." },
  changha: { highest: "여섯 개 중에 오늘 제일 높아, 자랑해도 돼.", lowest: "여섯 개 중에 오늘 제일 낮아, 여기선 힘 빼자." },
  elina: {
    highest: "여섯 분야 중에 오늘 가장 높아요, 마음껏 해 봐요.",
    lowest: "여섯 분야 중에 오늘 가장 낮아요, 여기선 힘을 덜 써도 괜찮아.",
  },
  yuna: { highest: "여섯 개 중 오늘 제일 높아, 여기에 힘 줘.", lowest: "여섯 개 중 오늘 제일 낮아, 여기선 힘 빼." },
  dosa: { highest: "여섯 분야 가운데 오늘 가장 높소.", lowest: "여섯 분야 가운데 오늘 가장 낮으니 힘을 덜 쓰시오." },
};

export function fortuneFieldNote(field: FortuneField, score: number, voice: Voice) {
  return (voice === "plain" ? fieldNotes : fieldBand[voice])[field][band(score)];
}

/**
 * 분야 한 칸을 펼쳤을 때의 풀이. 점수 구간 문장 + 오늘 십신이 그 분야에 주는 문장 + 여섯 분야 중 자리.
 * `shown`: 머리 줄에 이미 보인 점수 구간 문장은 되풀이하지 않는다.
 */
export function fortuneFieldDetail(
  field: FortuneField,
  score: number,
  evidence: FortuneEvidence,
  rank: "highest" | "lowest" | null,
  shown: boolean,
) {
  const voice = voiceOf(evidence);
  const sentences: string[] = [];
  if (!shown) sentences.push(fortuneFieldNote(field, score, voice));
  if (isTenGod(evidence.tenGod)) sentences.push(groupField[voice][groupOf[evidence.tenGod]][field]);
  if (rank) sentences.push(rankLine[voice][rank]);
  return {
    // 점수는 바로 위 칸 머리에 이미 보여 근거 줄에 되풀이하지 않는다.
    basis: isTenGod(evidence.tenGod) ? fieldBasis(field, evidence.tenGod, evidence.relation) : null,
    text: sentences.join(" "),
  };
}

const groups: readonly Group[] = ["peer", "output", "wealth", "duty", "resource"];
/** 십신 다섯 묶음의 쉬운 이름(분야 칸 근거 줄). 계산 용어(비겁·식상·재성·관성·인성)는 근거 줄에 쓰지 않는다. */
const groupPlain: Record<Group, string> = {
  peer: "나와 같은 기운",
  output: "표현하는 기운",
  wealth: "재물 기운",
  duty: "책임 기운",
  resource: "채워 주는 기운",
};
/** 분야가 보는 십신 자리. 서버 점수 규칙(chemi-engine/fortune 의 field)과 같은 배정이다. 애정은 성별에 따라 달라 일지(배우자 자리)로 적는다. */
const fieldSeat: Record<Exclude<FortuneField, "love">, Group> = {
  people: "peer", fandom: "output", money: "wealth", work: "duty", rest: "resource",
};
/** 일지와 오늘의 사이를 짧게(애정 칸 근거 줄). */
const relationShort: Record<Relation, string> = {
  육합: "짝을 이룸",
  삼합: "힘을 모음",
  반합: "반쯤 손잡음",
  충: "정면으로 부딪침",
  형: "서로 깎임",
  해: "엇갈림",
  원진: "서먹함",
  복음: "같은 글자가 겹침",
  없음: "부딪침도 도움도 없음",
};

/** 분야마다 다른 근거 한 줄: 그 분야가 보는 기운과 오늘 들어온 기운의 사이(같음·오늘이 키움·오늘이 누름·자리가 누름·자리가 흘려보냄). */
function fieldBasis(field: FortuneField, tenGod: TenGod, relation: string) {
  if (field === "love") return `연애 자리 · 내 사주와 오늘이 ${relationShort[relationOf(relation)]}`;
  const seat = groupPlain[fieldSeat[field]];
  const today = groupPlain[groupOf[tenGod]];
  const gap = (groups.indexOf(fieldSeat[field]) - groups.indexOf(groupOf[tenGod]) + 5) % 5;
  const tie = [
    `오늘도 ${seat}이 들어와 힘이 겹치는 날`,
    `오늘 들어온 ${today}이 ${seat}을 키워 주는 날`,
    `오늘 들어온 ${today}이 ${seat}을 누르는 날`,
    `${seat}이 오늘 들어온 ${today}을 누르는 날`,
    `${seat}이 오늘 들어온 ${today}으로 흘러가는 날`,
  ][gap];
  return `${seat} 자리 · ${tie}`;
}

/** 질문하기에서 '왜'를 물었을 때 덧붙이는 근거(말투는 부르는 쪽이 고른다). */
export function fortuneWhy(evidence: FortuneEvidence) {
  return isTenGod(evidence.tenGod)
    ? { pillar: evidence.dayPillar, god: evidence.tenGod, short: tenGodShort[evidence.tenGod] }
    : null;
}
