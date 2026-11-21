/**
 * 사주 풀이의 근거 줄과 영역별 풀이. 사주표와 시각에서 계산한 값(일간·일지·오행 개수·세운·월운의 십신)만 쓰고,
 * 용어 옆에 쉬운 풀이를 붙인다. 같은 사주표와 같은 시각이면 같은 문장이 나온다.
 * 풀이에 없는 날짜·사람·금액은 만들지 않는다. 한자 사주표는 그리지 않는다(무료 결과는 쉬운 말, decisions 11/17).
 */
import {
  branchElement,
  branchRelation,
  controls,
  dayBranch,
  dayStem,
  elementCounts,
  elementName,
  elements,
  generates,
  monthSpanAt,
  seasonAt,
  stemElement,
  tenGod,
  type Chart,
  type Element,
  type Pillar,
  type Relation,
  type TenGod,
} from "./chart";
import { godNotes, helping, monthReading, stemNotes, yearReading } from "./copy";
import { tenGodPlain, tenGodShort } from "./terms";

/** 오행의 한자 이름(목·화·토·금·수). 일간을 "병화"처럼 부를 때 쓴다. */
export const elementTerm: Record<Element, string> = { wood: "목", fire: "화", earth: "토", metal: "금", water: "수" };

const subject: Record<Element, string> = { wood: "나무가", fire: "불이", earth: "흙이", metal: "쇠가", water: "물이" };

export type BasisRow = { term: string; value: string; plain: string };
export type DepthView = "first" | "year" | "month";
export const depthDomains = ["love", "work", "money", "people", "health"] as const;
export type DepthDomain = (typeof depthDomains)[number];
export type DomainDetail = { key: DepthDomain; level: "좋음" | "보통" | "조심"; basis: string; sentences: string[] };

const pillarName = (pillar: Pillar) => `${pillar.heavenlyStem}${pillar.earthlyBranch}`;

/** 일간과 일지의 오행 사이. 일지는 가까운 사람과 속마음의 자리로 읽는다. */
type Seat = "same" | "supports" | "spends" | "handles" | "presses";
function seatOf(chart: Chart): Seat {
  const own = stemElement[dayStem(chart)];
  const seat = branchElement[dayBranch(chart)];
  if (seat === own) return "same";
  if (generates[seat] === own) return "supports";
  if (generates[own] === seat) return "spends";
  return controls[own] === seat ? "handles" : "presses";
}
const seatPlain: Record<Seat, string> = {
  same: "일간과 같은 기운이라 겉과 속이 닮았어요",
  supports: "일간을 받쳐 주는 자리라 마음이 든든해요",
  spends: "내 기운을 쏟는 자리라 좋아하는 일에 힘을 다 써요",
  handles: "내가 다루는 자리라 가까운 사람과 살림을 챙겨요",
  presses: "나를 다잡는 자리라 스스로에게 엄격해요",
};

const relationName: Record<Relation, string> = { good: "합", rough: "충", plain: "무난" };
const relationPlain = (unit: "해" | "달"): Record<Relation, string> => ({
  good: `일지와 손을 잡는 ${unit}라 일이 순하게 풀려요`,
  rough: `일지와 부딪치는 ${unit}라 자리와 관계가 한 번 흔들려요`,
  plain: `일지와 부딪침이 없어 큰 변동이 적은 ${unit === "해" ? "해예요" : "달이에요"}`,
});

/**
 * 신강·신약. 나와 같은 기운과 나를 낳는 기운이 전체의 절반 이상이면 신강으로 본다.
 * 월지는 계절이라 한 번 더 센다(운세 점수 계산 server/chemi-engine/fortune 과 같은 기준).
 */
function strengthOf(chart: Chart) {
  const month = chart.pillars.month;
  if (!month) return null;
  const own = stemElement[dayStem(chart)];
  const mother = elements.find((element) => generates[element] === own)!;
  const all: Element[] = [branchElement[month.earthlyBranch]];
  for (const pillar of Object.values(chart.pillars))
    if (pillar) all.push(stemElement[pillar.heavenlyStem], branchElement[pillar.earthlyBranch]);
  return all.filter((element) => element === own || element === mother).length * 2 >= all.length;
}

function countsLine(chart: Chart) {
  const counts = elementCounts(chart);
  const top = Math.max(...elements.map((element) => counts[element]));
  const most = elements.filter((element) => counts[element] === top);
  const none = elements.filter((element) => counts[element] === 0);
  const value = elements.map((element) => `${elementName[element]} ${counts[element]}`).join(" · ");
  const lead = `${most.map((element) => elementName[element]).join("·")} 기운이 ${top}개로 가장 많아요`;
  const tail = none.length
    ? `${none.map((element) => elementName[element]).join("·")} 기운은 없어요`
    : "다섯 기운이 모두 있어요";
  return { value, plain: `${lead}. ${tail}`, counts, most, none };
}

/** 풀이 근거 줄. 용어(term) · 계산 값(value) · 쉬운 풀이(plain). */
export function sajuBasis(chart: Chart, at: number, view: DepthView): BasisRow[] {
  const stem = dayStem(chart);
  const branch = dayBranch(chart);
  const own = stemElement[stem];
  const season = seasonAt(at);
  const yearGod = tenGod(stem, season.yearPillar.heavenlyStem);
  const open = chart.locked.length === 0;
  const helpRow: BasisRow = {
    term: "도움 기운",
    value: helping(chart),
    plain: "사주에서 가장 적은 기운이에요. 채워 주면 균형이 맞아요",
  };
  const yearRow: BasisRow = {
    term: "세운",
    value: `${pillarName(season.yearPillar)}년 · ${yearGod}`,
    plain: tenGodPlain[yearGod],
  };

  if (view === "first") {
    const rows: BasisRow[] = [
      {
        term: "일간",
        value: `${stem}${elementTerm[own]}`,
        plain: `${stemNotes[stem].image}에 비유해요. ${stemNotes[stem].trait} 사람이에요`,
      },
      {
        term: "일지",
        value: `${branch} · ${elementName[branchElement[branch]]}`,
        plain: seatPlain[seatOf(chart)],
      },
    ];
    if (open) {
      const line = countsLine(chart);
      rows.push({ term: "오행", value: line.value, plain: line.plain });
      const strong = strengthOf(chart);
      if (strong !== null)
        rows.push({
          term: strong ? "신강" : "신약",
          value: strong ? "기운이 넉넉한 사주" : "도움이 필요한 사주",
          plain: strong
            ? "나와 나를 돕는 기운이 절반을 넘어요. 힘을 밖으로 쓸 때 편해요"
            : "나와 나를 돕는 기운이 절반에 못 미쳐요. 도움을 받을 때 힘이 나요",
        });
      rows.push(helpRow);
    }
    rows.push(yearRow);
    return rows;
  }

  if (view === "year") {
    const tie = branchRelation(branch, season.yearPillar.earthlyBranch);
    const rows: BasisRow[] = [
      yearRow,
      {
        term: "세운과 일지",
        value: `${season.yearPillar.earthlyBranch}·${branch} · ${relationName[tie]}`,
        plain: relationPlain("해")[tie],
      },
    ];
    for (const month of yearReading(chart, at).basis)
      rows.push({
        term: month.kind === "good" ? "좋은 달" : "여유 둘 달",
        value: `${month.label} ${month.pillar}월 · ${month.god}`,
        plain: tenGodPlain[month.god],
      });
    return rows;
  }

  const span = monthSpanAt(at);
  const monthGod = tenGod(stem, span.pillar.heavenlyStem);
  const tie = branchRelation(branch, span.pillar.earthlyBranch);
  const rows: BasisRow[] = [
    { term: "월운", value: `${pillarName(span.pillar)}월 · ${monthGod}`, plain: tenGodPlain[monthGod] },
    {
      term: "월운과 일지",
      value: `${span.pillar.earthlyBranch}·${branch} · ${relationName[tie]}`,
      plain: relationPlain("달")[tie],
    },
  ];
  for (const week of monthReading(chart, at).basis)
    rows.push({
      term: week.kind === "good" ? "힘 있는 주" : week.kind === "rest" ? "쉬어 갈 주" : "지난 흐름",
      value: week.range,
      plain: `이 주의 일진 ${week.days}일 가운데 일지와 합이 ${week.good}일, 충이 ${week.rough}일이에요`,
    });
  return rows;
}

/** 십신이 영역마다 어떻게 드러나는지. 한 칸에 한 문장. */
const godDomain: Record<TenGod, Record<DepthDomain, string>> = {
  비견: {
    love: "닮은 사람에게 끌리고, 친구처럼 편한 사이가 잘 맞아요.",
    work: "혼자보다 같이 할 때 속도가 나지만, 같은 자리를 노리는 사람도 생겨요.",
    money: "버는 만큼 사람에게 쓰는 돈이 늘어요.",
    people: "뜻이 같은 사람이 곁에 모여요.",
    health: "남과 견주다 무리하기 쉬워요.",
  },
  겁재: {
    love: "마음을 주는 만큼 서운함도 커지기 쉬워요.",
    work: "내 몫과 남의 몫이 섞이기 쉬워 역할을 분명히 해야 해요.",
    money: "돈이 들어와도 나갈 곳이 먼저 보여요.",
    people: "부탁이 늘어 거절이 필요한 때가 와요.",
    health: "욕심을 내다 지치기 쉬워요.",
  },
  식신: {
    love: "같이 먹고 웃는 시간이 마음을 가깝게 해요.",
    work: "좋아하는 일을 꾸준히 하면 결과가 따라와요.",
    money: "하던 일에서 조금씩 수입이 붙어요.",
    people: "편하게 어울리는 자리가 늘어요.",
    health: "잘 먹고 잘 쉬는 기운이라 몸이 편안해요.",
  },
  상관: {
    love: "솔직한 표현이 매력이 되지만, 말이 앞서면 다툼이 돼요.",
    work: "새 아이디어와 재주가 눈에 띄고, 정해진 규칙과는 부딪치기 쉬워요.",
    money: "재주가 돈으로 이어지지만 기분 따라 쓰기도 쉬워요.",
    people: "하고 싶은 말이 많아져서 듣는 쪽 기분을 한 번 살펴야 해요.",
    health: "생각과 말이 많아 신경이 쉽게 피곤해져요.",
  },
  편재: {
    love: "새로운 만남이 늘고 마음이 빨리 움직여요.",
    work: "여러 일이 한꺼번에 들어와 발이 바빠져요.",
    money: "큰돈이 오가고, 들어오는 만큼 나가는 흐름이에요.",
    people: "처음 보는 사람과 인연이 넓어져요.",
    health: "바쁘게 움직이다 쉬는 때를 놓치기 쉬워요.",
  },
  정재: {
    love: "꾸준히 챙기는 마음이 믿음으로 쌓여요.",
    work: "성실하게 맡은 일이 그대로 인정받아요.",
    money: "차곡차곡 모으는 돈이 눈에 보여요.",
    people: "약속을 지키는 사람으로 믿음을 얻어요.",
    health: "규칙적인 생활이 잘 맞아요.",
  },
  편관: {
    love: "끌림이 강하지만 상대에게 휘둘리기 쉬워요.",
    work: "부담 큰 일이 맡겨지고, 끝까지 해내면 실력이 돼요.",
    money: "예상 못 한 지출이 생기기 쉬워요.",
    people: "기가 센 사람과 마주칠 일이 있어요.",
    health: "긴장이 오래 가서 잠이 얕아지기 쉬워요.",
  },
  정관: {
    love: "예의를 지키는 만남이 오래가요.",
    work: "책임 있는 자리와 평판이 따라와요.",
    money: "정해진 수입 안에서 안정돼요.",
    people: "윗사람이나 어른과의 관계가 풀려요.",
    health: "정해 둔 하루 순서를 지키면 몸이 편해요.",
  },
  편인: {
    love: "혼자 있는 시간이 필요해 마음 표현이 줄어요.",
    work: "새 분야를 배우기 좋고, 시작은 느려요.",
    money: "배움과 취미에 쓰는 돈이 늘어요.",
    people: "여럿보다 한두 사람과 깊게 지내요.",
    health: "생각이 많아 몸이 굳기 쉬워요.",
  },
  정인: {
    love: "챙김을 받는 일이 많아져요.",
    work: "배운 것을 정리하고 자격을 갖추기 좋아요.",
    money: "큰 수입보다 도움과 지원이 들어와요.",
    people: "도와주는 사람이 가까이 와요.",
    health: "마음이 편해져 회복이 빨라요.",
  },
};

/** 건강·쉼은 십신마다 따로 본다(다른 네 영역은 godNotes.rate). */
const healthLevel: Record<TenGod, DomainDetail["level"]> = {
  비견: "보통", 겁재: "조심", 식신: "좋음", 상관: "조심", 편재: "보통",
  정재: "좋음", 편관: "조심", 정관: "좋음", 편인: "보통", 정인: "좋음",
};

const action: Record<DepthDomain, Record<DomainDetail["level"], string>> = {
  love: {
    좋음: "마음을 먼저 말해도 좋은 때예요.",
    보통: "평소처럼 지내며 연락을 이어 가면 돼요.",
    조심: "중요한 말은 하루 두었다가 꺼내요.",
  },
  work: {
    좋음: "미뤄 둔 일을 꺼내 시작해요.",
    보통: "하던 일을 순서대로 끝내요.",
    조심: "새 일을 벌이기보다 맡은 일의 마무리에 힘을 써요.",
  },
  money: {
    좋음: "계획한 지출과 저축을 시작하기 좋아요.",
    보통: "쓰는 곳을 한 번 적어 보면 충분해요.",
    조심: "큰 지출은 미루고 약속한 돈부터 챙겨요.",
  },
  people: {
    좋음: "먼저 연락하고 자리에 나가요.",
    보통: "익숙한 사람과 짧게 안부를 나눠요.",
    조심: "부탁은 들어줄 수 있는 만큼만 받아요.",
  },
  health: {
    좋음: "가벼운 운동을 새로 시작하기 좋아요.",
    보통: "자는 시간을 일정하게 지켜요.",
    조심: "일정을 줄이고 잠을 먼저 챙겨요.",
  },
};

const restTip: Record<Element, string> = {
  wood: "몸을 쭉 펴는 스트레칭이 잘 맞아요.",
  fire: "열을 식히는 밤 시간과 잠이 중요해요.",
  earth: "식사 시간을 일정하게 지키면 좋아요.",
  metal: "숨을 깊게 쉬고 환기를 자주 해요.",
  water: "몸을 따뜻하게 하고 물을 자주 마셔요.",
};

/** 사주표에서 그 영역을 보는 자리와 개수로 만든 문장. 시간·절기 때문에 잠긴 사주표는 일지만 읽는다. */
function natalLine(chart: Chart, domain: DepthDomain): { tag: string; text: string } | null {
  const own = stemElement[dayStem(chart)];
  if (domain === "love") {
    const branch = dayBranch(chart);
    const seat = seatOf(chart);
    const easy = seat === "same" || seat === "supports" || seat === "spends";
    return {
      tag: `일지 ${branch}`,
      text: `연애 자리인 일지가 ${branch}(${elementName[branchElement[branch]]})예요. ${
        easy
          ? "일간과 서로 돕는 기운이라 가까운 사이에서 마음이 편해요."
          : "일간과 서로 누르는 기운이라 가까울수록 맞춰 가는 시간이 필요해요."
      }`,
    };
  }
  if (chart.locked.length > 0) return null;
  const counts = elementCounts(chart);
  if (domain === "health") {
    const line = countsLine(chart);
    const top = line.most[0];
    return {
      tag: `${elementName[top]} ${counts[top]}개`,
      text: `사주에 ${subject[top]} ${counts[top]}개로 가장 많아요. ${restTip[top]}`,
    };
  }
  const target =
    domain === "money" ? controls[own] : domain === "people" ? own : elements.find((element) => controls[element] === own)!;
  const count = counts[target] - (domain === "people" ? 1 : 0);
  const name = elementName[target];
  const bucket = count === 0 ? 0 : count <= 2 ? 1 : 2;
  const text = {
    money: [
      `사주에 재성(내가 다루는 기운, ${name})이 없어요. 들어온 돈을 붙잡는 습관을 따로 만들어야 해요.`,
      `사주에 재성(내가 다루는 기운, ${name})이 ${count}개 있어요. 벌고 쓰는 균형이 무난한 편이에요.`,
      `사주에 재성(내가 다루는 기운, ${name})이 ${count}개로 많아요. 기회는 많지만 벌인 일을 감당할 힘을 아껴야 해요.`,
    ],
    work: [
      `사주에 관성(나를 다잡는 기운, ${name})이 없어요. 틀에 매이지 않는 대신 마감은 스스로 정해야 해요.`,
      `사주에 관성(나를 다잡는 기운, ${name})이 ${count}개 있어요. 맡은 자리에서 책임을 다하는 힘이 있어요.`,
      `사주에 관성(나를 다잡는 기운, ${name})이 ${count}개로 많아요. 책임을 많이 지는 만큼 쉬는 시간을 먼저 잡아야 해요.`,
    ],
    people: [
      `사주에 비겁(나와 같은 기운, ${name})이 일간 말고는 없어요. 혼자 해내는 데 익숙해서 도움을 청하는 연습이 필요해요.`,
      `사주에 비겁(나와 같은 기운, ${name})이 일간 말고 ${count}개 있어요. 내 편이 되어 줄 사람이 곁에 있어요.`,
      `사주에 비겁(나와 같은 기운, ${name})이 일간 말고 ${count}개로 많아요. 사람은 많지만 주도권을 두고 부딪치기 쉬워요.`,
    ],
  }[domain][bucket];
  const term = { money: "재성", work: "관성", people: "비겁" }[domain];
  return { tag: `${term} ${name} ${count}개`, text };
}

/**
 * 영역별 풀이(연애·일·돈·관계·건강). 첫 풀이와 올해는 세운, 이달은 월운의 십신으로 읽고,
 * 사주표에서 그 영역을 보는 자리의 개수를 더한다. 영역마다 2~4문장.
 */
export function sajuDomains(chart: Chart, at: number, view: DepthView): DomainDetail[] {
  const stem = dayStem(chart);
  const monthly = view === "month";
  const god = tenGod(stem, monthly ? monthSpanAt(at).pillar.heavenlyStem : seasonAt(at).yearPillar.heavenlyStem);
  const [people, work, money, love] = godNotes[god].rate;
  const level: Record<DepthDomain, DomainDetail["level"]> = { love, work, money, people, health: healthLevel[god] };
  return depthDomains.map((key) => {
    const natal = natalLine(chart, key);
    const lead = `${monthly ? "월운" : "세운"} ${god}`;
    return {
      key,
      level: level[key],
      basis: natal ? `${lead} · ${natal.tag}` : lead,
      sentences: [godDomain[god][key], ...(natal ? [natal.text] : []), action[key][level[key]]],
    };
  });
}

/** 질문하기에서 '왜'를 물었을 때 덧붙이는 근거 한 줄(말투는 부르는 쪽이 고른다). */
export function sajuWhy(chart: Chart, at: number, monthly: boolean) {
  const stem = dayStem(chart);
  const pillar = monthly ? monthSpanAt(at).pillar : seasonAt(at).yearPillar;
  const god = tenGod(stem, pillar.heavenlyStem);
  return { unit: monthly ? "이달" : "올해", pillar: `${pillarName(pillar)}${monthly ? "월" : "년"}`, god, short: tenGodShort[god] };
}
