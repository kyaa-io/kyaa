/**
 * 사주 첫 풀이의 전문 블록(명식표·오행·신강·십신·합충·올해 흐름) 문장.
 * 값은 모두 chart.ts 의 계산 함수(M 묶음)에서 나오고, 여기서는 글자 → 용어 → 쉬운 뜻 → 그래서 순서의 문장만 만든다.
 * 표·근거 줄은 세 최애가 같은 중립 해요체다(말투는 lines.ts 의 한마디에만). 같은 사주표와 시각이면 같은 문장이 나온다.
 * 시간을 모르거나 절기 날이라 비어 있는 기둥은 계산 범위에서 빠지고, 문장도 확인한 글자 수로만 말한다.
 */
import {
  balanceElements,
  branchElement,
  branchHanja,
  chartRelations,
  controls,
  dayStem,
  elementCounts,
  elementHanja,
  elementName,
  elementRatio,
  elements,
  flowRelations,
  generates,
  groupOf,
  hiddenStemDays,
  kstParts,
  pillarKeys,
  seasonAt,
  stemElement,
  stemHanja,
  strengthOf,
  tenGod,
  tenGodCells,
  tenGodDistribution,
  toHanja,
  voidOf,
  type Branch,
  type Chart,
  type ChartRelation,
  type Element,
  type Pillar,
  type PillarKey,
  type StrengthClass,
  type TenGod,
  type TenGodGroup,
} from "./chart";
import { stemNotes } from "./copy";
import { elementTerm, seatOf, seatPlain } from "./depth";
import { tenGodPlain, tenGodShort } from "./terms";
import { lifeStages, spiritStars } from "./terms-i18n";
import type { Tx } from "./tx";


/** 받침이 있으면 앞, 없으면 뒤(은/는, 이/가, 을/를, 과/와). ㄹ 받침은 '로'를 쓴다. */
const hasFinal = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};
const josa = (word: string, withFinal: string, without: string) => `${word}${hasFinal(word) ? withFinal : without}`;
const ro = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${code % 28 === 0 || code % 28 === 8 ? "로" : "으로"}`;
};
const countWord = ["영", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟"];

export const pillarName: Record<PillarKey, string> = { hour: "시주", day: "일주", month: "월주", year: "연주" };
const stemSeat: Record<PillarKey, string> = { hour: "시간", day: "일간", month: "월간", year: "연간" };
const branchSeat: Record<PillarKey, string> = { hour: "시지", day: "일지", month: "월지", year: "연지" };

export type Row = { term: string; value: string; plain: string };

/* ── 명식표 ── */

export type SheetCell = { letter: string; hanja: string; element: Element };
export type SheetColumn =
  | { key: PillarKey; name: string; known: false }
  | {
      key: PillarKey;
      name: string;
      known: true;
      me: boolean;
      stemGod: string;
      branchGod: string;
      stem: SheetCell;
      branch: SheetCell;
      /** 지장간(여기·중기·정기), 마지막이 본기 */
      hidden: string[];
      lifeStage: string | null;
      spirit: string | null;
    };

export function sheetColumns(chart: Chart, tx?: Tx | null): SheetColumn[] {
  const day = dayStem(chart);
  const god = (value: TenGod) => (tx ? tx.t.god(value) : value);
  return pillarKeys.map((key) => {
    const pillar = chart.pillars[key];
    const name = tx
      ? key === "day" ? `${tx.t.pillar(key)} · ${tx.t.me}` : tx.t.pillar(key)
      : key === "day" ? "일주 · 나" : pillarName[key];
    if (!pillar) return { key, name, known: false };
    const detail = chart.details?.[key];
    return {
      key,
      name,
      known: true,
      me: key === "day",
      stemGod: key === "day" ? (tx ? tx.t.stemSeat("day") : "일간") : god(tenGod(day, pillar.heavenlyStem)),
      branchGod: god(tenGod(day, hiddenStemDays[pillar.earthlyBranch].at(-1)![0])),
      stem: { letter: pillar.heavenlyStem, hanja: stemHanja[pillar.heavenlyStem], element: stemElement[pillar.heavenlyStem] },
      branch: { letter: pillar.earthlyBranch, hanja: branchHanja[pillar.earthlyBranch], element: branchElement[pillar.earthlyBranch] },
      hidden: hiddenStemDays[pillar.earthlyBranch].map(([stem]) => stemHanja[stem]),
      lifeStage: detail?.lifeStage ? (tx ? tx.t.stage(detail.lifeStage) : detail.lifeStage) : null,
      spirit: detail?.spirit ? (tx ? tx.t.spirit(detail.spirit) : detail.spirit) : null,
    };
  });
}

export const sheetLabel = (chart: Chart, tx?: Tx | null) =>
  tx
    ? tx.f("sheetLabel", {
        list: pillarKeys
          .map((key) => {
            const pillar = chart.pillars[key];
            return pillar ? `${tx.t.pillar(key)} ${tx.hanja(pillar)}` : tx.f("sheetUnknown", { pillar: tx.t.pillar(key) });
          })
          .join(", "),
      })
    : "사주 여덟 글자. " +
      pillarKeys
        .map((key) => {
          const pillar = chart.pillars[key];
          return pillar ? `${pillarName[key]} ${pillar.heavenlyStem}${pillar.earthlyBranch}` : `${pillarName[key]} 모름`;
        })
        .join(", ");

const stagePlain: Record<string, string> = {
  장생: "새로 시작하는 자리",
  목욕: "마음이 들뜨는 자리",
  관대: "꾸미고 나서는 자리",
  건록: "제 힘으로 서는 자리",
  제왕: "힘이 가장 센 자리",
  쇠: "힘을 고르는 자리",
  병: "쉬어 가는 자리",
  사: "멈춰서 비우는 자리",
  묘: "안으로 갈무리하는 자리",
  절: "끊고 새로 잇는 자리",
  태: "새 뜻을 품는 자리",
  양: "천천히 기르는 자리",
};
const spiritPlain: Record<string, string> = {
  겁살: "빼앗기지 않게 지키는 기운",
  재살: "새는 것을 막는 기운",
  천살: "하늘이 정해 주는 기운",
  지살: "자리를 옮기는 기운",
  년살: "눈길을 끄는 기운",
  월살: "막힌 것을 푸는 기운",
  망신살: "말과 행동이 드러나는 기운",
  장성살: "앞에 나서는 기운",
  반안살: "안정되고 편안한 기운",
  역마살: "움직이게 되는 기운",
  육해살: "쉬며 살피는 기운",
  화개살: "혼자 깊어지는 기운",
};
/** 월지(절기 달)가 시작하는 절. */
const monthTerm: Record<Branch, string> = {
  인: "입춘", 묘: "경칩", 진: "청명", 사: "입하", 오: "망종", 미: "소서",
  신: "입추", 유: "백로", 술: "한로", 해: "입동", 자: "대설", 축: "소한",
};

export type LegendItem = { seat: string; hanja: string; name: string; plain: string };
export type SheetDetail = {
  stages: LegendItem[];
  spirits: LegendItem[];
  void: { hanja: string; letters: string; plain: string };
  basis: [string, string];
};

export function sheetDetail(chart: Chart, tx?: Tx | null): SheetDetail {
  const columns = sheetColumns(chart).filter((column) => column.known);
  const stages: LegendItem[] = [];
  const spirits: LegendItem[] = [];
  for (const column of columns) {
    const seat = tx ? tx.t.branchSeat(column.key) : `${branchSeat[column.key]}`;
    if (column.lifeStage)
      stages.push({
        seat,
        hanja: column.branch.hanja,
        name: tx ? tx.t.stage(column.lifeStage) : column.lifeStage,
        plain: (tx ? tx.p.stage[lifeStages.indexOf(column.lifeStage as (typeof lifeStages)[number])] : stagePlain[column.lifeStage]) ?? "",
      });
    if (column.spirit)
      spirits.push({
        seat,
        hanja: column.branch.hanja,
        name: tx ? tx.t.spirit(column.spirit) : column.spirit,
        plain: (tx ? tx.p.spirit[spiritStars.indexOf(column.spirit as (typeof spiritStars)[number])] : spiritPlain[column.spirit]) ?? "",
      });
  }
  const empty = voidOf(chart);
  const voidHanja = empty.branches.map((branch) => branchHanja[branch]).join("");
  if (tx) {
    const hour = chart.pillars.hour;
    const month = chart.pillars.month;
    return {
      stages,
      spirits,
      void: {
        hanja: voidHanja,
        letters: "",
        plain: empty.keys.length
          ? tx.f("voidIn", { seats: empty.keys.map((key) => `${tx.t.branchSeat(key)} ${branchHanja[chart.pillars[key]!.earthlyBranch]}`).join(" · ") })
          : tx.f("voidNone", { n: columns.length * 2 }),
      },
      basis: [
        chart.timeKnown
          ? hour ? tx.f("basisTime", { hour: branchHanja[hour.earthlyBranch] }) : tx.f("basisTimeOnly")
          : tx.f(month ? "basisNoTime" : "basisNoTimeTerm"),
        [
          month ? tx.f("basisMonth", { term: tx.t.solarTerm(monthTerm[month.earthlyBranch]), branch: branchHanja[month.earthlyBranch] }) : null,
          tx.f("basisDayChange"),
          tx.f("basisEngine"),
        ]
          .filter(Boolean)
          .join(" · "),
      ],
    };
  }
  const voidPlain = empty.keys.length
    ? `${empty.keys.map((key) => `${branchSeat[key]} ${branchHanja[chart.pillars[key]!.earthlyBranch]}`).join(" · ")}가 공망이에요. 그 자리의 힘은 조금 덜어서 읽어요`
    : `${countWord[columns.length * 2]} 글자에 공망에 든 글자가 없어요`;
  const hour = chart.pillars.hour;
  const month = chart.pillars.month;
  const first = chart.timeKnown
    ? `태어난 시각 → 서울 경도 보정 약 −32분 → ${hour ? `${hour.earthlyBranch}시` : "시주"}`
    : month
      ? "태어난 시간 모름 → 연 · 월 · 일 여섯 글자로 계산"
      : "태어난 시간 모름 · 절기 날 → 시간과 상관없는 글자로 계산";
  const second = [
    month ? `${monthTerm[month.earthlyBranch]} 뒤 출생이라 월주는 ${branchHanja[month.earthlyBranch]}월` : null,
    "밤 11시에 날짜가 바뀌는 기준",
    "만세력 엔진 manseryeok 2.0.0",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    stages,
    spirits,
    void: { hanja: voidHanja, letters: empty.branches.join(""), plain: voidPlain },
    basis: [first, second],
  };
}

/* ── 글자 모으기 ── */

type Letter = { key: PillarKey; place: "stem" | "branch"; hanja: string; element: Element };
function lettersOf(chart: Chart): Letter[] {
  return pillarKeys.flatMap((key) => {
    const pillar = chart.pillars[key];
    if (!pillar) return [];
    return [
      { key, place: "stem" as const, hanja: stemHanja[pillar.heavenlyStem], element: stemElement[pillar.heavenlyStem] },
      { key, place: "branch" as const, hanja: branchHanja[pillar.earthlyBranch], element: branchElement[pillar.earthlyBranch] },
    ];
  });
}
/** 지금 보이는 글자 수(8 · 6 · 4). 문장에서 '여덟 글자', '여섯 글자'로 부른다. */
export const scopeWord = (chart: Chart) => `${countWord[lettersOf(chart).length]} 글자`;
/** 시주나 월주가 비어 여덟 글자를 다 보지 못했는가. */
export const partial = (chart: Chart) => lettersOf(chart).length < 8;

/* ── 오행 ── */

const elementTrait: Record<Element, string> = {
  wood: "뻗어 나가는 힘이 커요",
  fire: "드러내고 밝히는 힘이 커요",
  earth: "버티고 지키는 힘이 커요",
  metal: "가르고 맺는 힘이 커요",
  water: "살피고 흘러가는 힘이 커요",
};

export type ElementView = {
  rows: { element: Element; name: string; hanja: string; percent: number; count: number; top: boolean }[];
  summary: Row[];
};

export function elementView(chart: Chart, tx?: Tx | null): ElementView {
  const ratio = elementRatio(chart);
  const counts = elementCounts(chart);
  const best = Math.max(...elements.map((element) => ratio[element]));
  const top = elements.find((element) => ratio[element] === best)!;
  const letters = lettersOf(chart);
  const scope = scopeWord(chart);
  const balance = balanceElements(chart);
  const wanted = balance ? [balance.useful, balance.supportive] : [];
  const topLetters = letters.filter((letter) => letter.element === top).map((letter) => letter.hanja);
  if (tx) {
    const word = tx.t.element;
    const trait = tx.p.element[top].trait;
    const summary: Row[] = [
      {
        term: tx.f("topTerm"),
        value: `${word(top)} ${ratio[top]}%`,
        plain: topLetters.length
          ? tx.f("topLetters", { letters: topLetters.join(" · "), n: topLetters.length, element: word(top), trait })
          : tx.f("topHidden", { trait }),
      },
    ];
    const none = elements.filter((element) => counts[element] === 0);
    if (none.length) {
      const names = none.map(word).join(" · ");
      const fill = none.filter((element) => wanted.includes(element));
      summary.push({
        term: tx.f("noneTerm"),
        value: tx.f("noneValue", { names }),
        plain: tx.join([
          tx.f("noneShown", { n: letters.length, names }),
          ...none
            .filter((element) => ratio[element] > 0)
            .map((element) => {
              const hosts = letters
                .filter((letter) => letter.place === "branch")
                .filter((letter) => hiddenStemDays[branchOf(letter.hanja)].some(([stem]) => stemElement[stem] === element))
                .map((letter) => letter.hanja);
              return tx.f("noneHidden", { hosts: [...new Set(hosts)].join(" · "), element: word(element), pct: ratio[element] });
            }),
          ...(fill.length ? [tx.f("noneFill", { names: fill.map(word).join(" · ") })] : []),
        ]),
      });
    } else {
      const low = Math.min(...elements.map((element) => ratio[element]));
      const least = elements.find((element) => ratio[element] === low)!;
      summary.push({ term: tx.f("leastTerm"), value: `${word(least)} ${ratio[least]}%`, plain: tx.f("leastPlain", { element: word(least) }) });
    }
    return {
      rows: elements.map((element) => ({
        element,
        name: word(element),
        hanja: elementHanja[element],
        percent: ratio[element],
        count: counts[element],
        top: element === top,
      })),
      summary,
    };
  }
  const summary: Row[] = [
    {
      term: "가장 많은 기운",
      value: `${elementName[top]} ${ratio[top]}%`,
      plain: topLetters.length
        ? `${topLetters.join(" · ")} ${countWord[topLetters.length]} 글자가 ${josa(elementName[top], "이에요", "예요")}. ${elementTrait[top]}`
        : `지장간에 모인 기운이에요. ${elementTrait[top]}`,
    },
  ];
  const none = elements.filter((element) => counts[element] === 0);
  if (none.length) {
    const names = none.map((element) => elementName[element]).join(" · ");
    const hidden = none
      .filter((element) => ratio[element] > 0)
      .map((element) => {
        const hosts = letters
          .filter((letter) => letter.place === "branch")
          .filter((letter) => hiddenStemDays[branchOf(letter.hanja)].some(([stem]) => stemElement[stem] === element))
          .map((letter) => letter.hanja);
        return `${[...new Set(hosts)].join(" · ")} 속 지장간까지 세면 ${elementName[element]} ${ratio[element]}%예요`;
      });
    const fill = none.filter((element) => wanted.includes(element));
    summary.push({
      term: "없는 기운",
      value: `${names} 0자`,
      plain: [
        `겉에 드러난 ${scope}에는 ${josa(names, "이", "가")} 없어요`,
        ...hidden,
        ...(fill.length ? [`${fill.map((element) => elementName[element]).join(" · ")}${hasFinal(elementName[fill.at(-1)!]) ? "을" : "를"} 채우면 균형이 맞아요`] : []),
      ].join(". "),
    });
  } else {
    const low = Math.min(...elements.map((element) => ratio[element]));
    const least = elements.find((element) => ratio[element] === low)!;
    summary.push({
      term: "가장 적은 기운",
      value: `${elementName[least]} ${ratio[least]}%`,
      plain: `다섯 기운이 모두 겉에 드러나 있어요. 가장 적은 건 ${josa(elementName[least], "이에요", "예요")}`,
    });
  }
  return {
    rows: elements.map((element) => ({
      element,
      name: elementName[element],
      hanja: elementHanja[element],
      percent: ratio[element],
      count: counts[element],
      top: element === top,
    })),
    summary,
  };
}
const branchOf = (hanja: string) => (Object.keys(branchHanja) as Branch[]).find((branch) => branchHanja[branch] === hanja)!;

/* ── 일간 성향 ── */

const seasonOf: Record<Branch, string> = {
  인: "이른 봄", 묘: "봄 한가운데", 진: "늦봄",
  사: "이른 여름", 오: "여름 한가운데", 미: "늦여름",
  신: "이른 가을", 유: "가을 한가운데", 술: "늦가을",
  해: "이른 겨울", 자: "겨울 한가운데", 축: "늦겨울",
};
/** seasonOf 와 같은 순서(인월부터). 언어 묶음의 season 배열 자리를 찾는다. */
const seasonBranches: readonly Branch[] = ["인", "묘", "진", "사", "오", "미", "신", "유", "술", "해", "자", "축"];
type MonthTie = "same" | "mother" | "child" | "wealth" | "officer";
function monthTie(own: Element, month: Element): MonthTie {
  if (month === own) return "same";
  if (generates[month] === own) return "mother";
  if (generates[own] === month) return "child";
  return controls[own] === month ? "wealth" : "officer";
}
const tieNature: Record<MonthTie, string> = {
  same: "제철에 났어요. 자기 색이 뚜렷해요",
  mother: "일간을 낳아 주는 달이라 받쳐 주는 힘이 든든해요",
  child: "일간이 기운을 내어 주는 달이라 가진 것을 밖으로 꺼내 쓸 일이 많아요",
  wealth: "일간이 다루는 기운의 달이라 손이 바쁘고 챙길 것이 많아요",
  officer: "일간을 다잡는 달이라 스스로에게 엄격해요",
};

export function natureRows(chart: Chart, tx?: Tx | null): Row[] {
  const stem = dayStem(chart);
  const note = stemNotes[stem];
  const month = chart.pillars.month;
  const day = chart.pillars.day!;
  if (tx) {
    const mine = tx.p.stem[stem];
    return [
      month
        ? {
            term: tx.f("reasonTerm"),
            value: tx.f("natureMonth", { stem: stemHanja[stem], branch: branchHanja[month.earthlyBranch] }),
            plain: tx.p.tie[monthTie(stemElement[stem], branchElement[month.earthlyBranch])].nature,
          }
        : { term: tx.f("reasonTerm"), value: tx.f("natureDay", { pillar: tx.pillar(day) }), plain: tx.p.seat[seatOf(chart)] },
      { term: tx.f("strengthTerm"), value: mine.strength, plain: "" },
      { term: tx.f("cautionTerm"), value: mine.caution, plain: "" },
      { term: tx.f("fandomTerm"), value: mine.fandom, plain: "" },
    ];
  }
  const lead: Row = month
    ? {
        term: "근거",
        value: `일간 ${stemHanja[stem]}${hasFinal(stem) ? "이" : "가"} ${branchHanja[month.earthlyBranch]}월에 났어요`,
        plain: tieNature[monthTie(stemElement[stem], branchElement[month.earthlyBranch])],
      }
    : {
        term: "근거",
        value: `일주 ${toHanja(day.heavenlyStem + day.earthlyBranch, "pillar")} · ${day.heavenlyStem}${day.earthlyBranch}`,
        plain: seatPlain[seatOf(chart)],
      };
  return [
    lead,
    { term: "강점", value: note.strengthR, plain: "" },
    { term: "조심할 점", value: note.cautionR, plain: "" },
    { term: "나다운 덕질", value: note.fandomR, plain: "" },
  ];
}

/* ── 신강·신약 ── */

const classPlain: Record<StrengthClass, string> = {
  신약: "기운을 채워 쓰는 사주",
  중화: "기운이 고른 사주",
  신강: "기운을 밖으로 쓰는 사주",
};
const monthHelp: Record<MonthTie, string> = {
  same: "일간과 같은 기운의 달이라 달의 도움을 받았어요",
  mother: "일간을 낳는 기운의 달이라 달의 도움을 받았어요",
  child: "일간이 힘을 내어 주는 달이라 달의 도움은 받지 못했어요",
  wealth: "일간이 다루는 기운의 달이라 달의 도움은 받지 못했어요",
  officer: "일간을 다잡는 기운의 달이라 달의 도움은 받지 못했어요",
};

export type StrengthView = {
  index: number;
  class: StrengthClass;
  /** 화면에 적는 등급 이름(신약·중화·신강을 선택 언어로) */
  className: string;
  label: string;
  helpers: number;
  drainers: number;
  rows: Row[];
};

export function strengthView(chart: Chart, tx?: Tx | null): StrengthView | null {
  const strength = strengthOf(chart);
  const balance = balanceElements(chart);
  const month = chart.pillars.month;
  if (!strength || !balance || !month) return null;
  const stem = dayStem(chart);
  const own = stemElement[stem];
  const cells = tenGodCells(chart);
  const helperCells = cells.filter((cell) => groupOf(cell.god) === "비겁" || groupOf(cell.god) === "인성");
  const helperLetters = helperCells.map((cell) =>
    cell.place === "stem" ? stemHanja[cell.letter as keyof typeof stemHanja] : branchHanja[cell.letter as Branch],
  );
  const helperJosa = helperCells.length && hasFinal(helperCells.at(-1)!.letter) ? "이" : "가";
  const others = strength.drainers;
  const tie = monthTie(own, branchElement[month.earthlyBranch]);
  const useful = elementName[balance.useful];
  const supportive = elementName[balance.supportive];
  const adverse = elementName[balance.adverse];
  if (tx) {
    const word = tx.t.element;
    return {
      index: strength.index,
      class: strength.class,
      className: tx.t.strength(strength.class),
      label: tx.p.classPlain[strength.class],
      helpers: strength.helpers,
      drainers: strength.drainers,
      rows: [
        {
          term: tx.f("countTerm"),
          value: tx.f("strengthCount", { helpers: strength.helpers, drainers: strength.drainers }),
          plain: helperLetters.length
            ? tx.f("helpersPlain", { letters: helperLetters.join(" · "), stem: stemHanja[stem], n: others })
            : tx.f("helpersNone", { n: others }),
        },
        {
          term: tx.f("bornMonthTerm"),
          value: tx.f("bornMonth", { branch: branchHanja[month.earthlyBranch], season: tx.p.season[seasonBranches.indexOf(month.earthlyBranch)] }),
          plain: tx.p.tie[tie].help,
        },
        {
          term: tx.f("helpTerm"),
          value: `${word(balance.useful)} ${elementHanja[balance.useful]} · ${word(balance.supportive)} ${elementHanja[balance.supportive]}`,
          plain: tx.f(strength.leansStrong ? "helpStrong" : "helpWeak", { useful: word(balance.useful), supportive: word(balance.supportive) }),
        },
        {
          term: tx.f("burdenTerm"),
          value: `${word(balance.adverse)} ${elementHanja[balance.adverse]}`,
          plain: tx.f(strength.leansStrong ? "burdenStrong" : "burdenWeak"),
        },
      ],
    };
  }
  return {
    index: strength.index,
    class: strength.class,
    className: strength.class,
    label: classPlain[strength.class],
    helpers: strength.helpers,
    drainers: strength.drainers,
    rows: [
      {
        term: "글자 수",
        value: `돕는 글자 ${strength.helpers} · 덜어 내는 글자 ${strength.drainers}`,
        plain: helperLetters.length
          ? `${helperLetters.join(" · ")}${helperJosa} 일간 ${stemHanja[stem]}${hasFinal(stem) ? "을" : "를"} 돕고, 나머지 ${countWord[others]} 글자는 힘을 가져가요`
          : `일간을 돕는 글자가 없고, ${countWord[others]} 글자 모두 힘을 가져가요`,
      },
      {
        term: "태어난 달",
        value: `${branchHanja[month.earthlyBranch]}월 · ${seasonOf[month.earthlyBranch]}`,
        plain: monthHelp[tie],
      },
      {
        term: "도움 기운",
        value: `${useful} ${elementHanja[balance.useful]} · ${supportive} ${elementHanja[balance.supportive]}`,
        plain: strength.leansStrong
          ? `${josa(useful, "은", "는")} 일간을 다잡고 ${josa(supportive, "은", "는")} 일간이 다루는 기운이에요. 힘을 밖으로 쓸 자리가 돼요`
          : `${josa(useful, "은", "는")} 일간을 낳고 ${josa(supportive, "은", "는")} 일간과 같은 편이에요. 채워 주는 자리와 배우는 일이 힘이 돼요`,
      },
      {
        term: "부담 기운",
        value: `${adverse} ${elementHanja[balance.adverse]}`,
        plain: strength.leansStrong
          ? "일간과 같은 기운이에요. 더 쌓이면 고집이 세지기 쉬워요"
          : "일간을 누르는 기운이에요. 일을 한꺼번에 벌이면 지치기 쉬워요",
      },
    ],
  };
}

/* ── 십신 분포 ── */

export const groupPlain: Record<TenGodGroup, string> = {
  비겁: "나와 같은 기운",
  식상: "내가 내보내는 기운",
  재성: "내가 다루는 기운",
  관성: "나를 다잡는 기운",
  인성: "나를 돕는 기운",
};
const groupMany: Record<TenGodGroup, string> = {
  비겁: "내 힘과 고집이 세요. 혼자 해내는 일에 강해요",
  식상: "표현하고 만드는 힘이 커요. 말과 재주가 앞서요",
  재성: "다룰 일과 기회가 많아요. 벌인 일을 감당할 힘을 아껴 두면 좋아요",
  관성: "책임과 규칙을 잘 지켜요. 맡은 일을 끝까지 지키는 편이에요",
  인성: "배우고 받아들이는 힘이 커요. 생각이 깊은 만큼 움직임이 느려요",
};
const groupNone: Record<TenGodGroup, string> = {
  비겁: "도움을 청하는 연습이 필요해요",
  식상: "마음을 말로 꺼내는 연습이 필요해요",
  재성: "돈과 일정은 스스로 정해 두면 편해요",
  관성: "마감은 스스로 정해야 해요",
  인성: "스승과 쉬는 시간을 스스로 챙기면 좋아요",
};

export type TenGodView = {
  groups: { group: TenGodGroup; name: string; plain: string; count: number; letters: string[] }[];
  rows: Row[];
};

export function tenGodView(chart: Chart, tx?: Tx | null): TenGodView {
  const cells = tenGodCells(chart);
  const groups = tenGodDistribution(chart).map(({ group, count }) => ({
    group,
    name: tx ? tx.t.group(group) : group,
    plain: tx ? tx.p.group[group].plain : groupPlain[group],
    count,
    letters: cells
      .filter((cell) => groupOf(cell.god) === group)
      .map((cell) => (cell.place === "stem" ? stemHanja[cell.letter as keyof typeof stemHanja] : branchHanja[cell.letter as Branch])),
  }));
  const max = Math.max(...groups.map((group) => group.count));
  const most = groups.filter((group) => group.count === max);
  if (tx) {
    const none = groups.filter((group) => group.count === 0);
    const names = (list: typeof groups) => list.map((group) => group.name).join(" · ");
    return {
      groups,
      rows: [
        most.length === 1
          ? { term: tx.f("manyTerm"), value: tx.f("groupCount", { name: most[0].name, n: max }), plain: tx.p.group[most[0].group].many }
          : { term: tx.f("evenTerm"), value: tx.f("groupEach", { names: names(most), n: max }), plain: tx.f("evenPlain") },
        ...(none.length
          ? [{
              term: tx.f("noGroupTerm"),
              value: tx.f("noGroupValue", { names: names(none) }),
              plain: tx.join([tx.f("noGroupPlain", { names: names(none) }), ...none.map((group) => tx.p.group[group.group].none)]),
            }]
          : []),
      ],
    };
  }
  const rows: Row[] = [
    most.length === 1
      ? { term: "많은 묶음", value: `${most[0].group} ${max}개`, plain: groupMany[most[0].group] }
      : {
          term: "고른 묶음",
          value: `${most.map((group) => group.group).join(" · ")} ${max}개씩`,
          plain: "어느 한 기운으로 쏠리지 않아요",
        },
  ];
  const none = groups.filter((group) => group.count === 0);
  if (none.length)
    rows.push({
      term: "없는 묶음",
      value: `${none.map((group) => group.group).join(" · ")} 0`,
      plain: `겉으로 드러난 ${none.map((group) => group.group).join(" · ")}은 0개예요. ${none.map((group) => groupNone[group.group]).join(". ")}`,
    });
  return { groups, rows };
}

/* ── 합·충 ── */

export type RelationRow = {
  kind: ChartRelation["kind"];
  /** 화면에 적는 이름(육합·충을 선택 언어로) */
  kindName: string;
  where: string;
  tag: string;
  plain: string;
  /** 자리 표시: 칸을 켤 기둥과 줄(천간·지지) */
  keys: PillarKey[];
  place: "stem" | "branch";
  rough: boolean;
};

const stemKinds = new Set(["천간합", "천간충"]);
const roughKinds = new Set(["천간충", "충", "형", "자형"]);
const relationPlain: Record<ChartRelation["kind"], string> = {
  천간합: "두 자리가 손을 잡아요. 그 자리끼리 뜻을 모으기 쉬워요",
  천간충: "두 자리의 생각이 맞서요. 결정은 한 번 더 따져 봐요",
  방합: "같은 계절 글자가 모여 한 기운이 크게 뭉쳐요",
  삼합: "세 글자가 힘을 모아 한 기운이 커져요",
  반합: "두 글자가 한 기운으로 기울어요. 뜻이 맞는 사람과 손잡기 쉬워요",
  육합: "두 자리가 서로 끌어당겨요. 오래 둔 인연이 늦게 힘이 돼요",
  충: "두 자리의 결이 달라요. 자리를 옮길 때 한 박자 쉬어 가요",
  형: "가까운 사이에서 말이 날카로워지기 쉬워요. 한 번 돌려 말해요",
  자형: "같은 글자가 겹쳐 스스로를 다그치기 쉬워요",
};
const tagKey = {
  천간합: "tagMerge", 육합: "tagMerge", 삼합: "tagBigMerge", 반합: "tagHalf", 방합: "tagSeason",
  천간충: "tagStemClash", 충: "tagClash", 형: "tagPunish", 자형: "tagSelf",
} as const;
function relationTag(relation: ChartRelation, tx?: Tx | null) {
  if (tx) return tx.f(tagKey[relation.kind], { element: relation.element ? tx.t.element(relation.element) : "" });
  const element = relation.element ? elementName[relation.element] : "";
  switch (relation.kind) {
    case "천간합":
    case "육합":
      return `${ro(element)} 모이는 합`;
    case "삼합":
      return `${ro(element)} 모이는 큰 합`;
    case "반합":
      return `${ro(element)} 기우는 반합`;
    case "방합":
      return `${element} 기운이 한 방향으로`;
    case "천간충":
      return "서로 맞서는 자리";
    case "충":
      return "서로 미는 자리";
    case "형":
      return "서로 깎는 자리";
    case "자형":
      return "같은 글자가 겹친 자리";
  }
}
/** 자리 글자의 한글 읽기(조사를 고를 때). */
const seatRead = (chart: Chart, key: PillarKey, place: "stem" | "branch") =>
  place === "stem" ? chart.pillars[key]!.heavenlyStem : chart.pillars[key]!.earthlyBranch;
const gwa = (chart: Chart, key: PillarKey, place: "stem" | "branch") => (hasFinal(seatRead(chart, key, place)) ? "과" : "와");
const seatLetter = (chart: Chart, key: PillarKey, place: "stem" | "branch", tx?: Tx | null) => {
  const pillar = chart.pillars[key]!;
  return place === "stem"
    ? `${tx ? tx.t.stemSeat(key) : stemSeat[key]} ${stemHanja[pillar.heavenlyStem]}`
    : `${tx ? tx.t.branchSeat(key) : branchSeat[key]} ${branchHanja[pillar.earthlyBranch]}`;
};

export function relationRows(chart: Chart, tx?: Tx | null): RelationRow[] {
  return chartRelations(chart).map((relation) => {
    const place = stemKinds.has(relation.kind) ? "stem" : "branch";
    const keys = [...new Set(relation.keys)];
    return {
      kind: relation.kind,
      kindName: tx ? tx.t.relation(relation.kind) : relation.kind,
      where: keys.map((key) => seatLetter(chart, key, place, tx)).join(keys.length > 2 ? " · " : " – "),
      tag: relationTag(relation, tx),
      plain: tx ? tx.p.relation[relation.kind].plain : relationPlain[relation.kind],
      keys,
      place,
      rough: roughKinds.has(relation.kind),
    };
  });
}

/* ── 올해 흐름 ── */

const flowPlain: Record<ChartRelation["kind"], string> = {
  천간합: "그 자리와 손을 잡아요. 그 자리 일에 힘이 모여요",
  천간충: "그 자리와 맞서요. 그 자리 일은 서두르지 말고 한 번 더 살펴요",
  방합: "같은 계절 글자가 모여 한 해 내내 기운이 짙어요",
  삼합: "원국 글자와 셋이 모여 한 해 동안 기운이 크게 들어와요",
  반합: "가까운 자리에 움직일 힘이 붙어요. 미뤄 둔 일을 꺼내기 쉬워요",
  육합: "그 자리와 서로 끌어당겨요. 가까운 인연이 힘이 돼요",
  충: "그 자리가 한 번 흔들려요. 자리를 옮길 일은 한 박자 쉬어 가요",
  형: "그 자리에서 말이 날카로워지기 쉬워요. 한 번 돌려 말해요",
  자형: "같은 글자가 겹쳐 스스로를 다그치기 쉬워요",
};

export type YearFlowView = {
  me: { pillar: Pillar; hanja: string };
  year: { label: number; pillar: Pillar; hanja: string };
  rows: Row[];
};

export function yearFlowView(chart: Chart, at: number, tx?: Tx | null): YearFlowView {
  const season = seasonAt(at);
  const flow = season.yearPillar;
  const stem = dayStem(chart);
  const god = tenGod(stem, flow.heavenlyStem);
  const counts = elementCounts(chart);
  const flowElement = stemElement[flow.heavenlyStem];
  const scope = scopeWord(chart);
  if (tx) {
    const n = lettersOf(chart).length;
    const word = tx.t.element;
    const stemTerm = tx.f("stemOf", { letter: stemHanja[flow.heavenlyStem] });
    const branchTerm = tx.f("branchOf", { letter: branchHanja[flow.earthlyBranch] });
    const rows: Row[] = [
      {
        term: stemTerm,
        value: `${tx.t.god(god)} · ${tx.p.god[god].short}`,
        plain: tx.join([
          counts[flowElement] === 0 ? tx.f(partial(chart) ? "flowAbsentPartial" : "flowAbsent", { element: word(flowElement), n }) : "",
          tx.p.god[god].plain,
        ]),
      },
    ];
    const relations = flowRelations(chart, flow);
    for (const relation of relations.filter((item) => stemKinds.has(item.kind)))
      rows.push({
        term: stemTerm,
        value: tx.f(relation.kind === "천간합" ? "flowStemMerge" : "flowStemClash", {
          seats: relation.natal.map((key) => seatLetter(chart, key, "stem", tx)).join(" · "),
        }),
        plain: tx.p.relation[relation.kind].flow,
      });
    const branchRelations = relations.filter((item) => !stemKinds.has(item.kind));
    for (const relation of branchRelations) {
      const keys = [...new Set(relation.natal)];
      const fresh = relation.element && (relation.kind === "삼합" || relation.kind === "방합") && counts[relation.element] === 0;
      rows.push({
        term: branchTerm,
        value:
          tx.f("flowBranch", { kind: tx.t.relation(relation.kind), seats: keys.map((key) => seatLetter(chart, key, "branch", tx)).join(" · ") }) +
          (relation.element ? ` (${word(relation.element)})` : ""),
        plain: tx.join([tx.p.relation[relation.kind].flow, fresh ? tx.f("flowFresh", { element: word(relation.element!), n }) : ""]),
      });
    }
    if (!branchRelations.length)
      rows.push({ term: branchTerm, value: partial(chart) ? tx.f("flowNonePartial", { n }) : tx.f("flowNone"), plain: tx.f("flowNonePlain") });
    const balance = balanceElements(chart);
    if (balance && (flowElement === balance.useful || flowElement === balance.supportive))
      rows.push({ term: tx.f("helpTerm"), value: tx.f("yearOf", { element: word(flowElement) }), plain: tx.f("flowHelpPlain") });
    else if (balance && flowElement === balance.adverse)
      rows.push({ term: tx.f("burdenTerm"), value: tx.f("yearOf", { element: word(flowElement) }), plain: tx.f("flowBurdenPlain") });
    const mine = chart.pillars.day!;
    return {
      me: { pillar: mine, hanja: tx.hanja(mine) },
      year: { label: season.year, pillar: flow, hanja: tx.hanja(flow) },
      rows,
    };
  }
  const absent =
    counts[flowElement] === 0
      ? `${partial(chart) ? `확인한 ${scope}에는` : `${scope}에`} 없던 ${josa(elementName[flowElement], "이", "가")} 들어와요. `
      : "";
  const day = chart.pillars.day!;
  const rows: Row[] = [
    {
      term: `천간 ${stemHanja[flow.heavenlyStem]}`,
      value: `${god} · ${tenGodShort[god]}`,
      plain: absent + tenGodPlain[god],
    },
  ];
  const relations = flowRelations(chart, flow);
  for (const relation of relations.filter((item) => stemKinds.has(item.kind)))
    rows.push({
      term: `천간 ${stemHanja[flow.heavenlyStem]}`,
      value: `${relation.natal.map((key) => seatLetter(chart, key, "stem")).join(" · ")}${gwa(chart, relation.natal.at(-1)!, "stem")} ${relation.kind === "천간합" ? "합" : "충"}`,
      plain: flowPlain[relation.kind],
    });
  const branchRelations = relations.filter((item) => !stemKinds.has(item.kind));
  for (const relation of branchRelations) {
    const keys = [...new Set(relation.natal)];
    const natal = keys.map((key) => seatLetter(chart, key, "branch")).join(" · ");
    const element = relation.element ? `(${elementName[relation.element]})` : "";
    const fresh =
      relation.element && (relation.kind === "삼합" || relation.kind === "방합") && counts[relation.element] === 0
        ? ` ${scope}에 없던 ${elementName[relation.element]} 기운이 국으로 모여요`
        : "";
    rows.push({
      term: `지지 ${branchHanja[flow.earthlyBranch]}`,
      value: `${natal}${gwa(chart, keys.at(-1)!, "branch")} ${relation.kind}${element}`,
      plain: flowPlain[relation.kind] + (fresh ? `.${fresh}` : ""),
    });
  }
  if (!branchRelations.length)
    rows.push({
      term: `지지 ${branchHanja[flow.earthlyBranch]}`,
      value: partial(chart) ? `확인한 ${scope}와 합 · 충 · 형 없음` : "원국 글자와 합 · 충 · 형 없음",
      plain: "합 · 충 · 형으로 묶이거나 맞서는 자리는 아니에요",
    });
  const balance = balanceElements(chart);
  if (balance) {
    const name = elementName[flowElement];
    if (flowElement === balance.useful || flowElement === balance.supportive)
      rows.push({
        term: "도움 기운",
        value: `올해가 ${name}의 해`,
        plain: "도움 기운이 해 전체에 깔려 있어요. 무리해서 넓히기보다 하나를 깊게 파 봐요",
      });
    else if (flowElement === balance.adverse)
      rows.push({
        term: "부담 기운",
        value: `올해가 ${name}의 해`,
        plain: "부담 기운이 해 전체에 깔려 있어요. 일을 한꺼번에 벌이지 말고 나눠서 해요",
      });
  }
  return {
    me: { pillar: day, hanja: toHanja(day.heavenlyStem + day.earthlyBranch, "pillar") },
    year: { label: season.year, pillar: flow, hanja: toHanja(flow.heavenlyStem + flow.earthlyBranch, "pillar") },
    rows,
  };
}

/** 제목 아래 '戊土 · 무토 일간' 줄. */
export function dayLine(chart: Chart, tx?: Tx | null) {
  const stem = dayStem(chart);
  const element = stemElement[stem];
  return {
    hanja: `${stemHanja[stem]}${elementHanja[element]}`,
    read: tx ? tx.f("dayLine", { yinyang: tx.t.yinYang(stem), element: tx.t.element(element) }) : `${stem}${elementTerm[element]} 일간`,
  };
}

/** 절기 날 + 시간 모름일 때 명식표 아래 한 번 적는 잠금 사유. */
export function termNote(chart: Chart, tx?: Tx | null) {
  if (!chart.solarTerm || chart.pillars.month) return null;
  const at = new Date(chart.solarTerm.at).getTime();
  const { year, month, day } = kstParts(at);
  if (tx)
    return tx.f(chart.pillars.year ? "termNoteMonth" : "termNoteYearMonth", {
      date: `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
      term: tx.t.solarTerm(chart.solarTerm.name),
      time: new Intl.DateTimeFormat(tx.locale, { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(at),
    });
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(at)
    .split(":")
    .map(Number);
  const clock = `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시 ${minute}분`;
  const pillars = chart.pillars.year ? "월주가" : "연주와 월주가";
  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}는 ${chart.solarTerm.name} 날이에요. ${clock} 앞뒤로 ${pillars} 달라져서, 아래 네 풀이는 시간을 알면 열려요.`;
}

/** 시주·월주가 비면 블록 제목 옆에 적는 계산 범위(여섯 글자 기준). 여덟 글자면 없다. */
export const scopeLabel = (chart: Chart, tx?: Tx | null) =>
  partial(chart) ? (tx ? tx.f("scopeLabel", { n: lettersOf(chart).length }) : `${scopeWord(chart)} 기준`) : null;
