/**
 * 사주 풀이 문장. 풀이 표(AS-TX)가 들어오기 전까지 승인 시안 03 의 말투로 만든 임시 문장이다.
 * 같은 사주표와 같은 시각이면 같은 문장이 나온다.
 * 좋은 달·힘 있는 주는 아직 끝나지 않은 기간에서만 고르고, 이미 지난 기간은 '지난 흐름'으로만 말한다.
 */
import {
  branchRelation,
  dayBranch,
  dayPillarAt,
  dayStem,
  elementColor,
  elementCounts,
  elementName,
  elements,
  generates,
  helpingElement,
  kstParts,
  monthSpanAt,
  seasonAt,
  seoulDateLabel,
  stemElement,
  tenGod,
  type Branch,
  type Chart,
  type MonthSpan,
  type Pillar,
  type Stem,
  type TenGod,
} from "./chart";
import type { Tx } from "./tx";

/** 최애 말투 셋: 창하·유나 반말, 엘리나 요체, kyaa 도사 하오체. */
export type Voiced = { ban: string; yo: string; hao: string };

type StemNote = {
  /** 한낮의 해처럼 — 일간을 비유하는 말 */
  image: string;
  /** 「…한 사람」 앞에 오는 말 */
  trait: string;
  strengthR: string;
  strengthN: string;
  cautionR: string;
  cautionN: string;
  fandomR: string;
  /** 「창하와 나」 줄 */
  bond: string;
};

export const stemNotes: Record<Stem, StemNote> = {
  갑: {
    image: "곧게 뻗은 큰 나무",
    trait: "한번 정한 길을 끝까지 가는",
    strengthR: "한번 정한 일은 끝까지 밀고 가요",
    strengthN: "한번 정한 일을 끝까지 밀고 가는 것",
    cautionR: "굽히는 데 서툴러 혼자 짊어져요",
    cautionN: "굽히는 게 서툴러 혼자 짊어지는 것",
    fandomR: "오래 꾸준히 응원할 때 가장 빛나요",
    bond: "같이 걸으면 길이 곧아지는 사이",
  },
  을: {
    image: "바위틈에서도 피는 풀꽃",
    trait: "부드럽게 버티는",
    strengthR: "환경이 바뀌어도 금방 적응해요",
    strengthN: "환경이 바뀌어도 금방 적응하는 것",
    cautionR: "속마음을 숨기다 지칠 때가 있어요",
    cautionN: "속마음을 숨기다 지치는 것",
    fandomR: "조용히 챙기고 오래 곁을 지킬 때 빛나요",
    bond: "말하지 않아도 챙겨 주는 사이",
  },
  병: {
    image: "한낮의 해",
    trait: "좋아하는 걸 숨기지 않는",
    strengthR: "좋아하는 마음을 바로 말로 꺼내요",
    strengthN: "좋아하는 마음을 바로 말로 꺼내는 것",
    cautionR: "서운한 일을 오래 마음에 담아 둬요",
    cautionN: "서운한 일을 오래 담아 두는 것",
    fandomR: "현장에서 크게 응원할 때 가장 빛나요",
    bond: "같이 있으면 대화가 끊이지 않는 사이",
  },
  정: {
    image: "어둠을 밝히는 촛불",
    trait: "작은 온기를 오래 건네는",
    strengthR: "한 사람에게 깊게 마음을 써요",
    strengthN: "한 사람에게 깊게 마음을 쓰는 것",
    cautionR: "마음이 식으면 확 멀어져요",
    cautionN: "마음이 식으면 확 멀어지는 것",
    fandomR: "한 명을 깊게 파고들 때 가장 빛나요",
    bond: "작은 말에도 온기가 도는 사이",
  },
  무: {
    image: "오래된 큰 산",
    trait: "흔들려도 자리를 지키는",
    strengthR: "무슨 일에도 중심을 잡아요",
    strengthN: "무슨 일에도 중심을 잡는 것",
    cautionR: "마음을 바꾸는 데 시간이 걸려요",
    cautionN: "마음을 바꾸는 데 시간이 걸리는 것",
    fandomR: "묵묵히 오래 지켜볼 때 가장 빛나요",
    bond: "곁에 있으면 든든해지는 사이",
  },
  기: {
    image: "씨앗을 품은 너른 밭",
    trait: "사람과 일을 키워 내는",
    strengthR: "곁의 사람을 자연스럽게 챙겨요",
    strengthN: "곁의 사람을 자연스럽게 챙기는 것",
    cautionR: "남의 일까지 떠안고 지쳐요",
    cautionN: "남의 일까지 떠안고 지치는 것",
    fandomR: "함께 키워 가는 응원에서 가장 빛나요",
    bond: "같이 있으면 뭐든 자라는 사이",
  },
  경: {
    image: "잘 벼린 쇠칼",
    trait: "옳고 그름이 분명한",
    strengthR: "결정이 빠르고 맺고 끊음이 분명해요",
    strengthN: "결정이 빠르고 맺고 끊음이 분명한 것",
    cautionR: "말이 곧아서 차갑게 들릴 때가 있어요",
    cautionN: "말이 곧아서 차갑게 들리는 것",
    fandomR: "정보를 모으고 정리할 때 가장 빛나요",
    bond: "솔직하게 말해도 편한 사이",
  },
  신: {
    image: "닦을수록 빛나는 보석",
    trait: "섬세하게 다듬는",
    strengthR: "작은 차이를 먼저 알아봐요",
    strengthN: "작은 차이를 먼저 알아보는 것",
    cautionR: "스스로에게 기준이 높아 예민해져요",
    cautionN: "스스로에게 기준이 높아 예민해지는 것",
    fandomR: "굿즈와 기록을 아름답게 모을 때 빛나요",
    bond: "서로를 더 빛나게 닦아 주는 사이",
  },
  임: {
    image: "멈추지 않는 큰 강",
    trait: "넓게 받아들이는",
    strengthR: "처음 보는 사람과도 금방 어울려요",
    strengthN: "처음 보는 사람과도 금방 어울리는 것",
    cautionR: "마음이 이리저리 흘러 갈피를 잃어요",
    cautionN: "마음이 이리저리 흘러 갈피를 잃는 것",
    fandomR: "여러 사람과 함께 즐길 때 가장 빛나요",
    bond: "같이 있으면 이야기가 흘러가는 사이",
  },
  계: {
    image: "새벽에 내리는 맑은 이슬비",
    trait: "조용히 스며드는",
    strengthR: "분위기를 먼저 읽고 맞춰 줘요",
    strengthN: "분위기를 먼저 읽고 맞춰 주는 것",
    cautionR: "걱정을 혼자 오래 품어요",
    cautionN: "걱정을 혼자 오래 품는 것",
    fandomR: "밤에 혼자 영상을 보며 깊어질 때 빛나요",
    bond: "말없이 곁에 있어도 편한 사이",
  },
};

/** 첫 풀이 키워드 한 칸: 짧은 이름 + 오늘 해 볼 행동 한 줄. */
export type Keyword = { name: string; act: string };

/**
 * 조심할 것·즐거운 것. 근거는 같은 일간의 stemNotes 칸이다.
 * caution ← cautionN(타고난 주의점), joy ← strengthN + fandomR(강점을 쓰는 팬 활동).
 */
export const stemKeywords: Record<Stem, { caution: Keyword; joy: Keyword }> = {
  갑: {
    caution: { name: "혼자 짊어지기", act: "오늘 하나는 부탁해 보기" },
    joy: { name: "꾸준한 응원", act: "응원 기록을 하루 한 줄 남기기" },
  },
  을: {
    caution: { name: "속마음 숨기기", act: "서운한 건 한 줄로 말하기" },
    joy: { name: "조용히 챙기기", act: "놓친 영상에 댓글 하나 남기기" },
  },
  병: {
    caution: { name: "서운함 쌓아 두기", act: "그날 일은 그날 털어놓기" },
    joy: { name: "바로 말하는 응원", act: "좋았던 장면을 바로 댓글로 쓰기" },
  },
  정: {
    caution: { name: "확 식는 마음", act: "멀어지고 싶을 땐 하루만 미루기" },
    joy: { name: "깊게 파고들기", act: "본 영상에서 새 장면 하나 찾기" },
  },
  무: {
    caution: { name: "굳은 고집", act: "다른 의견 하나 끝까지 듣기" },
    joy: { name: "오래 지켜보기", act: "처음 좋아한 날의 영상 다시 보기" },
  },
  기: {
    caution: { name: "남의 몫까지 떠안기", act: "부탁 하나는 내일로 미루기" },
    joy: { name: "같이 키우는 응원", act: "팬 친구에게 영상 하나 보내기" },
  },
  경: {
    caution: { name: "곧은 말", act: "보내기 전에 말끝 한 번 고치기" },
    joy: { name: "정리하는 덕질", act: "이번 주 일정을 한 장에 모으기" },
  },
  신: {
    caution: { name: "스스로 깎기", act: "덜 다듬어도 한 번 올려 보기" },
    joy: { name: "기록 모으기", act: "오늘 사진 한 장 골라 앨범에 넣기" },
  },
  임: {
    caution: { name: "갈피 잃기", act: "오늘 볼 것 하나만 정하기" },
    joy: { name: "같이 보는 자리", act: "팬 모임에 인사 한 줄 남기기" },
  },
  계: {
    caution: { name: "혼자 하는 걱정", act: "걱정 하나는 누구에게 말하기" },
    joy: { name: "밤의 덕질", act: "자기 전 영상 보고 좋았던 점 적기" },
  },
};

/**
 * 행운. 근거는 올해와 일간의 관계(godNotes)의 flow 한 줄이다. from 은 그 줄의 자리(0 일·공부, 1 사람, 2 마음)이고,
 * 이름과 행동은 그 줄이 말하는 흐름을 오늘 할 일로 옮긴 것이다. 시기를 말하는 줄(상관 마음 "하반기")은 쓰지 않는다.
 */
export const godLuck: Record<TenGod, Keyword & { from: 0 | 1 | 2 }> = {
  비견: { from: 1, name: "같은 목표의 사람", act: "비슷한 목표인 사람에게 먼저 인사하기" },
  겁재: { from: 1, name: "선을 정한 부탁", act: "들어줄 수 있는 만큼 먼저 말하기" },
  식신: { from: 1, name: "같이 웃는 자리", act: "밥 약속 하나 먼저 잡기" },
  상관: { from: 0, name: "새로 시작한 일", act: "시작한 일을 한 사람에게 보여 주기" },
  편재: { from: 1, name: "새로 만나는 사람", act: "처음 만난 사람에게 먼저 말 걸기" },
  정재: { from: 1, name: "지킨 약속", act: "이번 주 약속 하나 끝까지 지키기" },
  편관: { from: 0, name: "끝까지 버틴 일", act: "어려운 일 하나 오늘 끝내기" },
  정관: { from: 0, name: "맡은 자리", act: "맡을 일 하나에 먼저 손 들기" },
  편인: { from: 0, name: "새 배움", act: "궁금했던 분야 영상 하나 찾아보기" },
  정인: { from: 1, name: "도와주는 사람", act: "도움 필요한 일 하나 부탁하기" },
};

export const roughHeadline = (stem: Stem) => `${stemNotes[stem].image}처럼, ${stemNotes[stem].trait} 사람`;

/** 타고난 기운 다섯 줄과 가장 많은 기운. */
export function elementRows(chart: Chart) {
  const counts = elementCounts(chart);
  const top = Math.max(...elements.map((element) => counts[element]));
  return elements.map((element) => ({
    element,
    name: elementName[element],
    count: counts[element],
    top: counts[element] === top && top > 0,
  }));
}
export const helping = (chart: Chart, tx?: Tx | null) => {
  const element = helpingElement(chart);
  return tx ? `${tx.t.element(element)} · ${tx.p.element[element].color}` : `${elementName[element]} · ${elementColor[element]}`;
};
const levelWord = (tx: Tx, level: Level | "많이" | "조금") => tx.p.level[level];

type Level = "좋음" | "보통" | "조심";
type GodNote = {
  yearTitle: string;
  yearBond: string;
  monthTitle: string;
  monthBond: string;
  grade: string;
  /** 사람·일·돈·연애 */
  rate: [Level, Level, Level, Level];
  /** 일·공부 / 사람 / 마음 */
  flow: [string, string, string];
};

export const godNotes: Record<TenGod, GodNote> = {
  비견: {
    yearTitle: "나란히 걷는 사람이 생기는 해",
    yearBond: "같이 뛰면 힘이 나는 해",
    monthTitle: "곁에서 같이 뛰는 달",
    monthBond: "말이 잘 통하는 달",
    grade: "다지는 해",
    rate: ["좋음", "보통", "조심", "보통"],
    flow: ["혼자 하던 일을 나눠 맡기 좋아요", "비슷한 목표의 사람을 만나요", "남과 견주는 마음은 줄여 봐요"],
  },
  겁재: {
    yearTitle: "내 몫을 단단히 지키는 해",
    yearBond: "서로 선을 지켜 주는 해",
    monthTitle: "욕심을 줄이고 챙기는 달",
    monthBond: "말을 아낄수록 편한 달",
    grade: "견디는 해",
    rate: ["보통", "보통", "조심", "보통"],
    flow: ["욕심내기보다 맡은 일부터 끝내요", "부탁은 선을 정하고 들어줘요", "지출과 약속을 한 번 더 세어 봐요"],
  },
  식신: {
    yearTitle: "하는 만큼 즐거움이 따라오는 해",
    yearBond: "응원이 잘 닿는 해",
    monthTitle: "좋아하는 걸 꾸준히 하는 달",
    monthBond: "같이 웃을 일이 많은 달",
    grade: "오르는 해",
    rate: ["좋음", "좋음", "보통", "좋음"],
    flow: ["좋아하는 일을 꾸준히 하면 결과가 나와요", "같이 먹고 웃는 자리가 늘어요", "여유가 생겨서 취미를 키우기 좋아요"],
  },
  상관: {
    yearTitle: "숨겨 둔 재주가 드러나는 해",
    yearBond: "응원이 잘 닿는 해",
    monthTitle: "하고 싶은 말이 터지는 달",
    monthBond: "아이디어를 주고받는 달",
    grade: "오르는 해",
    rate: ["좋음", "좋음", "보통", "조심"],
    flow: ["새로 시작한 일에 사람이 모이는 해예요", "솔직한 말이 눈에 띄어요, 말투만 부드럽게 해요", "하반기에 미뤄 둔 계획을 꺼내기 좋아요"],
  },
  편재: {
    yearTitle: "기회가 먼저 문을 두드리는 해",
    yearBond: "같이 움직이면 기회가 커지는 해",
    monthTitle: "발이 빨라지는 달",
    monthBond: "연락이 잦아지는 달",
    grade: "움직이는 해",
    rate: ["좋음", "좋음", "좋음", "보통"],
    flow: ["여러 일이 한꺼번에 들어와요, 순서를 정해요", "새로운 사람과 만날 일이 많아요", "쓰는 만큼 들어오니 장바구니는 한 번 쉬어요"],
  },
  정재: {
    yearTitle: "차곡차곡 쌓은 것이 보이는 해",
    yearBond: "믿고 맡길 수 있는 해",
    monthTitle: "꾸준함이 돈이 되는 달",
    monthBond: "약속이 잘 지켜지는 달",
    grade: "다지는 해",
    rate: ["보통", "좋음", "좋음", "좋음"],
    flow: ["맡은 일을 성실히 하면 인정이 따라와요", "약속을 지키는 사람으로 믿음을 얻어요", "계획한 지출을 지키면 마음이 편해요"],
  },
  편관: {
    yearTitle: "시험대에서 단단해지는 해",
    yearBond: "서로 자극이 되는 해",
    monthTitle: "버틸수록 단단해지는 달",
    monthBond: "쉬어 가도 괜찮은 달",
    grade: "견디는 해",
    rate: ["조심", "보통", "보통", "조심"],
    flow: ["부담이 큰 일이 와도 끝까지 하면 실력이 늘어요", "무리한 부탁은 거절해도 괜찮아요", "잠을 먼저 챙기면 마음이 가라앉아요"],
  },
  정관: {
    yearTitle: "맡은 자리에서 인정받는 해",
    yearBond: "믿음이 쌓이는 해",
    monthTitle: "평판이 올라가는 달",
    monthBond: "말이 잘 전해지는 달",
    grade: "오르는 해",
    rate: ["좋음", "좋음", "보통", "보통"],
    flow: ["책임 있는 자리를 맡기 좋은 때예요", "윗사람과 관계가 풀리는 해예요", "규칙적인 하루가 마음을 안정시켜요"],
  },
  편인: {
    yearTitle: "배움이 방향을 바꾸는 해",
    yearBond: "생각이 비슷해지는 해",
    monthTitle: "머릿속이 깊어지는 달",
    monthBond: "혼자 있는 시간도 지켜 주는 달",
    grade: "쉬어 가는 해",
    rate: ["보통", "보통", "조심", "조심"],
    flow: ["새로운 분야를 배우기 좋아요, 시작이 느려도 괜찮아요", "혼자 생각하는 시간이 길어져요", "생각이 많아지면 몸을 먼저 움직여요"],
  },
  정인: {
    yearTitle: "도움받아 안정을 찾는 해",
    yearBond: "기대어도 괜찮은 해",
    monthTitle: "든든한 사람이 곁에 오는 달",
    monthBond: "응원이 많이 닿는 달",
    grade: "다지는 해",
    rate: ["좋음", "보통", "보통", "좋음"],
    flow: ["배운 걸 정리하고 자격을 갖추기 좋아요", "도와주는 사람을 만나요", "마음이 편해져 오래 미룬 일을 꺼내요"],
  },
};

const godScore: Record<TenGod, number> = {
  식신: 2, 정재: 2, 정관: 2, 정인: 2, 상관: 1, 편재: 1, 편인: 1, 비견: 1, 편관: 0, 겁재: 0,
};

const monthLabel = (at: number) => `${kstParts(at).month}월`;
const dateRange = (from: number, to: number) => `${seoulDateLabel(from)} ~ ${seoulDateLabel(to - 86400000)}`;

function pillarKorean(pillar: Pillar) {
  return `${pillar.heavenlyStem}${pillar.earthlyBranch}`;
}

export type FirstReading = {
  stem: Stem;
  headline: string;
  image: string;
  trait: string;
  strengthR: string;
  strengthN: string;
  cautionR: string;
  cautionN: string;
  fandomR: string;
  bond: string;
  rows: ReturnType<typeof elementRows>;
  flowTitle: string;
  flow: { label: string; text: string }[];
  pillar: string;
  /** 조심할 것 · 즐거운 것 · 행운. basis 는 검토용 근거 키이고 화면에 쓰지 않는다. */
  keywords: { kind: "caution" | "joy" | "luck"; label: string; basis: string; name: string; act: string }[];
};

export function firstReading(chart: Chart, at: number, tx?: Tx | null): FirstReading {
  const stem = dayStem(chart);
  const note = stemNotes[stem];
  const season = seasonAt(at);
  const relation = tenGod(stem, season.yearPillar.heavenlyStem);
  const god = godNotes[relation];
  const marks = stemKeywords[stem];
  const luck = godLuck[relation];
  if (tx) {
    const mine = tx.p.stem[stem];
    return {
      ...firstReading(chart, at),
      headline: mine.title,
      image: mine.image,
      bond: mine.bond,
      keywords: [
        { kind: "caution", label: tx.f("kwCaution"), basis: `stemNotes.${stem}.cautionN`, name: mine.cautionName, act: mine.cautionAct },
        { kind: "joy", label: tx.f("kwJoy"), basis: `stemNotes.${stem}.strengthN+fandomR`, name: mine.joyName, act: mine.joyAct },
        { kind: "luck", label: tx.f("kwLuck"), basis: `godNotes.${relation}.flow.${luck.from}`, ...tx.p.luck[relation] },
      ],
    };
  }
  return {
    stem,
    headline: roughHeadline(stem),
    image: note.image,
    trait: note.trait,
    strengthR: note.strengthR,
    strengthN: note.strengthN,
    cautionR: note.cautionR,
    cautionN: note.cautionN,
    fandomR: note.fandomR,
    bond: note.bond,
    rows: elementRows(chart),
    flowTitle: "올해 흐름",
    flow: [
      { label: "일·공부", text: god.flow[0] },
      { label: "사람", text: god.flow[1] },
      { label: "마음", text: god.flow[2] },
    ],
    pillar: pillarKorean(chart.pillars.day!),
    keywords: [
      { kind: "caution", label: "조심할 것", basis: `stemNotes.${stem}.cautionN`, ...marks.caution },
      { kind: "joy", label: "즐거운 것", basis: `stemNotes.${stem}.strengthN+fandomR`, ...marks.joy },
      {
        kind: "luck",
        label: "행운",
        basis: `godNotes.${relation}.flow.${luck.from}`,
        name: luck.name,
        act: luck.act,
      },
    ],
  };
}

export type YearReading = {
  title: string;
  bond: string;
  /** 붉은 말의 해 */
  name: string;
  /** 2026 병오년 · 2.4 ~ 내년 2.3 */
  span: string;
  grade: string;
  rate: { label: string; level: Level }[];
  /** past: 이미 끝난 달. 좋은 달·여유 둘 달 표시는 남은 달에만 단다. */
  months: { label: string; mark?: "good" | "rest"; current: boolean; past: boolean }[];
  good: string;
  /** 남은 달이 하나뿐이거나 점수가 모두 같으면 없다. */
  rest: string | null;
  /** 남은 달보다 점수가 높았던 지난 달. 없으면 null. */
  past: string | null;
  help: string;
  line: Voiced;
  beforeSpring: boolean;
  /** 근거 줄에 쓰는 값: 고른 달의 월건과 십신. */
  basis: { kind: "good" | "rest"; label: string; pillar: string; god: TenGod }[];
};

const animal: Record<Branch, string> = {
  자: "쥐", 축: "소", 인: "범", 묘: "토끼", 진: "용", 사: "뱀", 오: "말", 미: "양", 신: "원숭이", 유: "닭", 술: "개", 해: "돼지",
};
const stemColor: Record<Stem, string> = {
  갑: "푸른", 을: "푸른", 병: "붉은", 정: "붉은", 무: "누런", 기: "누런", 경: "흰", 신: "흰", 임: "검은", 계: "검은",
};

function monthsOfSeason(chart: Chart, at: number) {
  const season = seasonAt(at);
  const day = dayStem(chart);
  const dayBr = dayBranch(chart);
  const list: { at: number; span: MonthSpan; score: number }[] = [];
  let cursor = season.startAt + 86400000;
  for (let i = 0; i < 12; i++) {
    const span = monthSpanAt(cursor);
    const relation = branchRelation(dayBr, span.pillar.earthlyBranch);
    const score =
      godScore[tenGod(day, span.pillar.heavenlyStem)] +
      (relation === "good" ? 1 : relation === "rough" ? -1 : 0);
    list.push({ at: span.startAt, span, score });
    cursor = span.endAt + 86400000;
  }
  return list;
}

export function yearReading(chart: Chart, at: number, tx?: Tx | null): YearReading {
  const season = seasonAt(at);
  const stem = dayStem(chart);
  const god = godNotes[tenGod(stem, season.yearPillar.heavenlyStem)];
  const months = monthsOfSeason(chart, at);
  const current = monthSpanAt(at).startAt;
  // 권하는 달은 아직 끝나지 않은 달에서만 고른다. 지난 달은 지난 흐름으로만 적는다.
  const left = months.filter((m) => m.span.endAt > at);
  const best = Math.max(...left.map((m) => m.score));
  const worst = Math.min(...left.map((m) => m.score));
  const goodMonths = left.filter((m) => m.score === best).slice(0, 2);
  const restMonth = worst < best ? left.find((m) => m.score === worst)! : null;
  const gone = months.filter((m) => m.span.endAt <= at && m.score > best);
  const top = Math.max(...gone.map((m) => m.score));
  const pastMonths = gone.filter((m) => m.score === top).slice(0, 2);
  const seasonStart = kstParts(season.startAt);
  const seasonEnd = kstParts(season.endAt);
  const { year: today } = kstParts(at);
  const names = (list: typeof months, joiner: string) => list.map((m) => monthLabel(m.at)).join(joiner);
  const rest = restMonth ? monthLabel(restMonth.at) : null;
  const line: Voiced = pastMonths.length
    ? {
        ban: `제일 좋던 ${names(pastMonths, "이랑 ")}은 지났어. 남은 달 중엔 ${names(goodMonths, "이랑 ")}이 좋아.`,
        yo: `제일 좋던 ${names(pastMonths, "과 ")}은 지났어요. 남은 달 중엔 ${names(goodMonths, "과 ")}이 좋아요.`,
        hao: `가장 좋던 ${names(pastMonths, "과 ")}은 지났소. 남은 달 중에는 ${names(goodMonths, "과 ")}이 좋소.`,
      }
    : {
        ban: `${names(goodMonths, "이랑 ")}이 좋은 달이야.${rest ? ` ${rest}엔 일정 줄이고 나랑 쉬자.` : ""}`,
        yo: `${names(goodMonths, "과 ")}이 좋은 달이에요.${rest ? ` ${rest}엔 일정을 줄이고 쉬어요.` : ""}`,
        hao: `${names(goodMonths, "과 ")}이 좋은 달이오.${rest ? ` ${rest}에는 일정을 줄이고 쉬시오.` : ""}`,
      };
  const row = (kind: "good" | "rest", m: (typeof months)[number]) => ({
    kind,
    label: tx ? tx.month(m.at) : monthLabel(m.at),
    pillar: tx ? tx.pillar(m.span.pillar) : pillarKorean(m.span.pillar),
    god: tenGod(stem, m.span.pillar.heavenlyStem),
  });
  if (tx) {
    const yearGod = tx.p.god[tenGod(stem, season.yearPillar.heavenlyStem)];
    const listed = (list: typeof months) => tx.list(list.map((m) => tx.month(m.at)));
    const say = pastMonths.length
      ? tx.f("yearLinePast", { past: listed(pastMonths), good: listed(goodMonths) })
      : tx.join([tx.f("yearLine", { good: listed(goodMonths) }), restMonth ? tx.f("yearLineRest", { rest: tx.month(restMonth.at) }) : ""]);
    const day = (time: number) => {
      const parts = kstParts(time);
      return `${parts.year}.${parts.month}.${parts.day}`;
    };
    const labels = tx.f("rateLabels").split("|");
    return {
      title: yearGod.yearTitle,
      bond: yearGod.yearBond,
      name: tx.f("yearName", { animal: tx.t.animal(season.yearPillar.earthlyBranch), element: tx.t.element(stemElement[season.yearPillar.heavenlyStem]) }),
      span: `${tx.f("pillarYear", { pillar: `${season.year} ${tx.pillar(season.yearPillar)}` })} · ${day(season.startAt)} ~ ${day(season.endAt - 86400000)}`,
      grade: yearGod.grade,
      rate: labels.map((label, index) => ({ label, level: levelWord(tx, god.rate[index]) as Level })),
      months: months.map((m) => ({
        label: String(m.span.month),
        mark: goodMonths.includes(m) ? "good" : m === restMonth ? "rest" : undefined,
        current: m.at === current,
        past: m.span.endAt <= at,
      })),
      good: goodMonths.map((m) => tx.month(m.at)).join(" · "),
      rest: restMonth ? tx.f("restTag", { month: tx.month(restMonth.at) }) : null,
      past: pastMonths.length ? pastMonths.map((m) => tx.month(m.at)).join(" · ") : null,
      help: helping(chart, tx),
      line: { ban: say, yo: say, hao: say },
      beforeSpring: today !== season.year,
      basis: [...goodMonths.map((m) => row("good", m)), ...(restMonth ? [row("rest", restMonth)] : [])],
    };
  }
  return {
    title: god.yearTitle,
    bond: god.yearBond,
    name: `${stemColor[season.yearPillar.heavenlyStem]} ${animal[season.yearPillar.earthlyBranch]}의 해`,
    span: `${season.year} ${pillarKorean(season.yearPillar)}년 · ${seasonStart.month}.${seasonStart.day} ~ ${seasonEnd.year === today ? "" : "내년 "}${seasonEnd.month}.${seasonEnd.day - 1}`,
    grade: god.grade,
    rate: (["사람", "일", "돈", "연애"] as const).map((label, index) => ({ label, level: god.rate[index] })),
    months: months.map((m) => ({
      label: String(m.span.month),
      mark: goodMonths.includes(m) ? "good" : m === restMonth ? "rest" : undefined,
      current: m.at === current,
      past: m.span.endAt <= at,
    })),
    good: names(goodMonths, " · "),
    rest: rest ? `${rest} · 일정을 넉넉하게` : null,
    past: pastMonths.length ? names(pastMonths, " · ") : null,
    help: helping(chart),
    line,
    beforeSpring: today !== season.year,
    basis: [...goodMonths.map((m) => row("good", m)), ...(restMonth ? [row("rest", restMonth)] : [])],
  };
}

export type MonthReading = {
  title: string;
  bond: string;
  /** 이달 · 11월 */
  name: string;
  span: string;
  rate: { label: string; level: Level }[];
  /** label 은 시작 날짜(11.14), range 는 시작~끝. past: 이미 끝난 주. 표시는 남은 주에만 단다. */
  weeks: { label: string; range: string; mark?: "good" | "rest"; current: boolean; past: boolean }[];
  strong: string;
  /** 남은 주가 하나뿐이거나 점수가 모두 같으면 없다. */
  rest: string | null;
  /** 남은 주보다 점수가 높았던 지난 주. 없으면 null. */
  past: string | null;
  nextTerm: string;
  line: Voiced;
  /** 근거 줄에 쓰는 값: 그 주 일진 가운데 일지와 합·충인 날 수. */
  basis: { kind: "good" | "rest" | "past"; range: string; days: number; good: number; rough: number }[];
};

export function monthReading(chart: Chart, at: number, tx?: Tx | null): MonthReading {
  const span = monthSpanAt(at);
  const stem = dayStem(chart);
  const dayBr = dayBranch(chart);
  const god = godNotes[tenGod(stem, span.pillar.heavenlyStem)];
  type Week = { label: string; range: string; score: number; current: boolean; past: boolean; days: number; good: number; rough: number };
  const scored: Week[] = [];
  const weekMs = 7 * 86400000;
  for (let start = span.startAt; start < span.endAt; start += weekMs) {
    let score = 0;
    let days = 0;
    let good = 0;
    let rough = 0;
    for (let d = 0; d < 7 && start + d * 86400000 < span.endAt; d++) {
      const pillar = dayPillarAt(start + d * 86400000);
      const relation = branchRelation(dayBr, pillar.earthlyBranch);
      days += 1;
      if (relation === "good") good += 1;
      if (relation === "rough") rough += 1;
      score += (relation === "good" ? 1 : relation === "rough" ? -1 : 0) + (godScore[tenGod(stem, pillar.heavenlyStem)] >= 2 ? 1 : 0);
    }
    const end = Math.min(start + weekMs, span.endAt);
    scored.push({
      label: seoulDateLabel(start),
      range: `${seoulDateLabel(start)}~${seoulDateLabel(end - 86400000)}`,
      score,
      current: at >= start && at < end,
      past: end <= at,
      days,
      good,
      rough,
    });
  }
  // 권하는 주는 아직 끝나지 않은 주에서만 고른다. 지난 주는 지난 흐름으로만 적는다.
  const left = scored.filter((week) => !week.past);
  const best = left.reduce((a, b) => (b.score > a.score ? b : a));
  const low = left.reduce((a, b) => (b.score < a.score ? b : a));
  const worst = low.score < best.score ? low : null;
  const gone = scored.filter((week) => week.past && week.score > best.score);
  const pastBest = gone.length ? gone.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const weeks: MonthReading["weeks"] = scored.map((week) => ({
    label: week.label,
    range: week.range,
    mark: week === best ? "good" : week === worst ? "rest" : undefined,
    current: week.current,
    past: week.past,
  }));
  const term = kstParts(span.endAt);
  const tag = (week: Week) => (week.current ? `${week.range} · 이번 주` : week.range);
  const row = (kind: "good" | "rest" | "past", week: Week) => ({
    kind,
    range: week.range,
    days: week.days,
    good: week.good,
    rough: week.rough,
  });
  const line: Voiced = pastBest
    ? {
        ban: `제일 좋던 ${pastBest.range} 주는 지났어. 남은 날 중엔 ${best.current ? "이번 주가" : `${best.range} 주가`} 좋아.`,
        yo: `제일 좋던 ${pastBest.range} 주는 지났어요. 남은 날 중엔 ${best.current ? "이번 주가" : `${best.range} 주가`} 좋아요.`,
        hao: `가장 좋던 ${pastBest.range} 주는 지났소. 남은 날 중에는 ${best.current ? "이번 주가" : `${best.range} 주가`} 좋소.`,
      }
    : best.current
      ? {
          ban: "이번 주가 제일 힘 있어. 미뤄 둔 거 지금 해.",
          yo: "이번 주가 제일 힘 있어요. 미뤄 둔 일은 지금 해요.",
          hao: "이번 주가 가장 힘 있소. 미뤄 둔 일은 지금 하시오.",
        }
      : {
          ban: `${best.range} 주가 제일 힘 있어. 미뤄 둔 건 그때 해.`,
          yo: `${best.range} 주가 제일 힘 있어요. 미뤄 둔 일은 그때 해요.`,
          hao: `${best.range} 주가 가장 힘 있소. 미뤄 둔 일은 그때 하시오.`,
        };
  if (tx) {
    const monthGod = tx.p.god[tenGod(stem, span.pillar.heavenlyStem)];
    const mark = (week: Week) => (week.current ? tx.f("thisWeekTag", { range: week.range }) : week.range);
    const say = pastBest
      ? tx.f("monthLinePast", { past: pastBest.range, best: best.current ? tx.f("thisWeek") : tx.f("weekOf", { range: best.range }) })
      : best.current
        ? tx.f("monthLineNow")
        : tx.f("monthLineThen", { range: best.range });
    const labels = tx.f("rateLabels").split("|");
    return {
      title: monthGod.monthTitle,
      bond: monthGod.monthBond,
      name: tx.f("thisMonth", { month: tx.month(span.startAt) }),
      span: dateRange(span.startAt, span.endAt),
      rate: labels.map((label, index) => ({ label, level: levelWord(tx, god.rate[index]) as Level })),
      weeks,
      strong: mark(best),
      rest: worst ? mark(worst) : null,
      past: pastBest ? pastBest.range : null,
      nextTerm: tx.f("nextTerm", { date: tx.date(span.endAt), term: tx.t.solarTerm(span.nextTerm) }),
      line: { ban: say, yo: say, hao: say },
      basis: [row("good", best), ...(worst ? [row("rest", worst)] : []), ...(pastBest ? [row("past", pastBest)] : [])],
    };
  }
  return {
    title: god.monthTitle,
    bond: god.monthBond,
    name: `이달 · ${span.month}월`,
    span: dateRange(span.startAt, span.endAt),
    rate: (["사람", "일", "돈", "연애"] as const).map((label, index) => ({ label, level: god.rate[index] })),
    weeks,
    strong: tag(best),
    rest: worst ? tag(worst) : null,
    past: pastBest ? pastBest.range : null,
    nextTerm: `${term.month}월 ${term.day}일 ${span.nextTerm}`,
    line,
    basis: [row("good", best), ...(worst ? [row("rest", worst)] : []), ...(pastBest ? [row("past", pastBest)] : [])],
  };
}

/** 두 일간의 오행 관계로 만든 궁합 풀이. 서버가 준 합·충 목록으로 한 칸씩 더한다. */
type Pair = "same" | "gives" | "controls";

export type PairReading = {
  title: string;
  /** 서로 채움 · 마음 결 · 끌림 · 맞춰 갈 곳. top 은 가장 높은 칸(같으면 모두). */
  rows: { label: string; level: "많이" | "보통" | "조금"; levelName?: string; top: boolean }[];
  /** 강조된 칸마다 그 칸의 설명 한 줄. */
  notes: { label: string; text: string }[];
  powers: string;
  clash: string;
  together: string;
  line: (name: string) => string;
};

const levels = ["조금", "보통", "많이"] as const;
const pairLabels = ["서로 채움", "마음 결", "끌림", "맞춰 갈 곳"] as const;
const pairTable: Record<
  Pair,
  { title: string; base: [number, number, number, number]; notes: [string, string, string, string]; clash: string; together: string; line: string }
> = {
  gives: {
    title: "온도는 달라도, 서로 없는 걸 채워 주는 사이",
    base: [2, 1, 1, 0],
    notes: [
      "한쪽이 달아오르면 다른 쪽이 식혀 줘요",
      "표현은 달라도 마음이 향하는 곳이 비슷해요",
      "다른 점이 오히려 서로를 궁금하게 해요",
      "속도가 다를 때는 한 걸음씩 맞춰 봐요",
    ],
    clash: "정해 둔 계획이 바뀔 때",
    together: "바뀌면 이유를 먼저 말하기",
    line: "온도는 달라도 잘 맞네.",
  },
  same: {
    title: "닮은 결이라, 말하지 않아도 통하는 사이",
    base: [1, 2, 0, 1],
    notes: [
      "비슷해서 채워 줄 건 적어도 마음은 편해요",
      "비슷한 기운이라 편하지만 같은 곳에서 같이 지쳐요",
      "닮은 점이 많아 천천히 가까워져요",
      "같은 고집이 겹칠 때는 한 사람이 먼저 물러서요",
    ],
    clash: "둘 다 양보하고 싶지 않을 때",
    together: "한 사람이 먼저 쉬자고 말하기",
    line: "결이 닮아서 편하겠네.",
  },
  controls: {
    title: "부딪히면서 서로를 키워 주는 사이",
    base: [1, 0, 2, 2],
    notes: [
      "서로 없는 힘을 상대에게서 배워요",
      "생각하는 방식이 달라 이야기가 길어져요",
      "다르니까 자꾸 눈이 가요",
      "한쪽이 길을 잡아 주고 다른 쪽이 속도를 조절해요",
    ],
    clash: "의견이 정반대로 갈릴 때",
    together: "결론보다 이유를 먼저 듣기",
    line: "다르니까 더 끌리는 사이네.",
  },
};

export function pairReading(a: Stem, b: Stem, combinations: number, clashes: number, tx?: Tx | null): PairReading {
  const ea = stemElement[a];
  const eb = stemElement[b];
  const kind: Pair = ea === eb ? "same" : generates[ea] === eb || generates[eb] === ea ? "gives" : "controls";
  const table = pairTable[kind];
  const bump = (value: number, by: number) => Math.max(0, Math.min(2, value + by));
  const [fill, mood, pull, adjust] = table.base;
  const scores = [fill, mood, bump(pull, combinations ? 1 : 0), bump(adjust, clashes ? 1 : 0)];
  const best = Math.max(...scores);
  const rows = pairLabels.map((label, index) => ({
    label,
    level: levels[scores[index]],
    top: scores[index] === best,
  }));
  if (tx) {
    const mine = tx.p.pair[kind];
    const labels = tx.f("pairLabels").split("|");
    const named = rows.map((row, index) => ({ ...row, label: labels[index], levelName: levelWord(tx, row.level) }));
    return {
      title: mine.title,
      rows: named,
      notes: named.flatMap((row, index) => (row.top ? [{ label: row.label, text: mine.notes[index] }] : [])),
      powers: `${tx.p.stem[a].image} × ${tx.p.stem[b].image}`,
      clash: mine.clash,
      together: mine.together,
      line: (name) => tx.join([mine.line, tx.f("pairAsk", { name })]),
    };
  }
  return {
    title: table.title,
    rows,
    notes: rows.flatMap((row, index) => (row.top ? [{ label: row.label, text: table.notes[index] }] : [])),
    powers: `${stemNotes[a].image} × ${stemNotes[b].image}`,
    clash: table.clash,
    together: table.together,
    line: (name) => `${table.line} ${name} 얘기 더 해 볼래?`,
  };
}

/** 궁합 기록에 두 명식이 있는 경우의 분야별 풀이. */
export function pairJudgments(self: Stem, partner: Stem, combinations: number, clashes: number, tx?: Tx | null) {
  const a = stemElement[self], b = stemElement[partner];
  const nourishing = generates[a] === b || generates[b] === a;
  if (tx) {
    const labels = tx.f("judgeLabels").split("|");
    const good = [a === b || nourishing, combinations > 0];
    return [
      { label: labels[0], level: levelWord(tx, good[0] ? "좋음" : "보통") },
      { label: labels[1], level: levelWord(tx, good[1] ? "좋음" : "보통") },
      { label: labels[2], level: levelWord(tx, clashes > 0 ? "조심" : "보통") },
    ];
  }
  return [
    { label: "마음", level: a === b || nourishing ? "좋음" : "보통" },
    { label: "생활", level: combinations > 0 ? "좋음" : "보통" },
    { label: "갈등", level: clashes > 0 ? "조심" : "보통" },
  ];
}
