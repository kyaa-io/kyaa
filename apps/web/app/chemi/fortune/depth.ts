/**
 * 오늘의 운세 근거 줄과 분야별 풀이. 서버가 계산해 준 값(일진·십신·일지와의 관계·12운성·도움 기운)만 쓰고,
 * 용어 옆에 쉬운 풀이를 붙인다. 같은 풀이면 같은 문장이 나온다. 풀이에 없는 날짜·사람·금액은 만들지 않는다.
 */
import type { TenGod } from "../saju/chart";
import { tenGodPlain, tenGodShort } from "../saju/terms";
import { band, fieldNotes, flowNotes, stageNotes } from "./result-copy";

export type FortuneEvidence = {
  dayPillar: string;
  yearPillar: string;
  relation: string;
  stage: string;
  tenGod: string;
  useful: string;
  timeBasis: string;
};
export type FortuneField = "fandom" | "people" | "work" | "rest" | "love" | "money";
type BasisRow = { term: string; value: string; plain: string };

/** 일지와 오늘 일진의 사이(서버 relation 이름). 표에 없는 이름은 '없음'으로 읽는다. */
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
const relationOf = (name: string) => (Object.hasOwn(relationPlain, name) ? name : "없음");

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

/** 오늘의 흐름: 등급 한마디 뒤에 일진과 십신, 일지와의 관계를 잇는다. 2~3문장. */
export function fortuneFlow(grade: string, evidence: FortuneEvidence) {
  const relation = relationOf(evidence.relation);
  const lines = [flowNotes[grade]];
  if (isTenGod(evidence.tenGod))
    lines.push(`오늘 일진은 ${evidence.dayPillar}, 내 일간에게는 ${evidence.tenGod}, ${tenGodShort[evidence.tenGod]}으로 와요.`);
  lines.push(`${relationPlain[relation]}.`);
  return lines.filter(Boolean).join(" ");
}

type Group = "peer" | "output" | "wealth" | "duty" | "resource";
const groupOf: Record<TenGod, Group> = {
  비견: "peer", 겁재: "peer", 식신: "output", 상관: "output", 편재: "wealth",
  정재: "wealth", 편관: "duty", 정관: "duty", 편인: "resource", 정인: "resource",
};

/** 오늘 일진의 십신(다섯 묶음)이 분야마다 어떻게 드러나는지. 한 칸에 한 문장. */
const groupField: Record<Group, Record<FortuneField, string>> = {
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
};

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
  const sentences: string[] = [];
  if (!shown) sentences.push(fieldNotes[field][band(score)]);
  if (isTenGod(evidence.tenGod)) sentences.push(groupField[groupOf[evidence.tenGod]][field]);
  if (rank === "highest") sentences.push("여섯 분야 중 오늘 가장 높아요.");
  if (rank === "lowest") sentences.push("여섯 분야 중 오늘 가장 낮으니 힘을 덜 써요.");
  return {
    basis: isTenGod(evidence.tenGod) ? `${score}점 · ${fieldBasis(field, evidence.tenGod, evidence.relation)}` : `${score}점`,
    text: sentences.join(" "),
  };
}

const groups: readonly Group[] = ["peer", "output", "wealth", "duty", "resource"];
const groupName: Record<Group, string> = { peer: "비겁", output: "식상", wealth: "재성", duty: "관성", resource: "인성" };
/** 분야가 보는 십신 자리. 서버 점수 규칙(chemi-engine/fortune 의 field)과 같은 배정이다. 애정은 성별에 따라 달라 일지(배우자 자리)로 적는다. */
const fieldSeat: Record<Exclude<FortuneField, "love">, Group> = {
  people: "peer", fandom: "output", money: "wealth", work: "duty", rest: "resource",
};

/** 분야마다 다른 근거 한 줄: 그 분야의 십신 자리와 오늘 일진 십신의 사이(같음·낳음·누름·맞섬·흘러감). */
function fieldBasis(field: FortuneField, tenGod: TenGod, relation: string) {
  if (field === "love") {
    const tie = relationOf(relation);
    return `배우자 자리 일지 · 일진과 ${tie === "없음" ? "합·충 없음" : tie}`;
  }
  const seat = groupName[fieldSeat[field]];
  const today = groupName[groupOf[tenGod]];
  const gap = (groups.indexOf(fieldSeat[field]) - groups.indexOf(groupOf[tenGod]) + 5) % 5;
  const tie = [
    `일진도 ${today}(${tenGod})인 날`,
    `일진 ${today}이 ${seat}을 낳는 날`,
    `일진 ${today}이 ${seat}을 누르는 날`,
    `${seat}이 일진 ${today}과 맞서는 날`,
    `${seat}이 일진 ${today}으로 흘러가는 날`,
  ][gap];
  return `${seat} 자리 · ${tie}`;
}

/** 질문하기에서 '왜'를 물었을 때 덧붙이는 근거(말투는 부르는 쪽이 고른다). */
export function fortuneWhy(evidence: FortuneEvidence) {
  return isTenGod(evidence.tenGod)
    ? { pillar: evidence.dayPillar, god: evidence.tenGod, short: tenGodShort[evidence.tenGod] }
    : null;
}
