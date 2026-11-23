/**
 * 타로 카드의 근거 줄: 카드 번호에서 알 수 있는 것(큰 흐름 카드인지, 어느 무늬·몇 번인지, 방향)만 쓴다.
 * 카드마다 쓴 풀이 글(content/chemi/tarot/cards.json)에 덧붙이는 문장이고, 같은 카드·같은 방향이면 같은 문장이 나온다.
 */
import { TAROT_DECK } from "./deck";
import { tarotLang, type TarotCharacter } from "./script";

type Suit = "major" | "wands" | "cups" | "swords" | "pentacles";

const suits: Record<Exclude<Suit, "major">, { name: string; element: string; plain: string }> = {
  wands: { name: "완드", element: "불", plain: "의욕과 행동의 카드예요" },
  cups: { name: "컵", element: "물", plain: "마음과 관계의 카드예요" },
  swords: { name: "소드", element: "바람", plain: "생각과 말의 카드예요" },
  pentacles: { name: "펜타클", element: "흙", plain: "돈과 몸, 일상의 카드예요" },
};
const suitOrder = ["wands", "cups", "swords", "pentacles"] as const;

/** 마이너 카드 1~10 의 단계. */
const steps = [
  "시작하는 자리",
  "고르고 균형을 잡는 자리",
  "첫 결실과 협력의 자리",
  "자리를 잡고 멈추는 자리",
  "부딪치고 흔들리는 자리",
  "회복하고 나누는 자리",
  "돌아보고 시험받는 자리",
  "움직이고 익히는 자리",
  "거의 다 온 자리",
  "마무리하고 다음으로 넘어가는 자리",
] as const;
const court = [
  ["시종", "배우는 사람이에요. 새 소식과 첫 시도를 말해요"],
  ["기사", "움직이는 사람이에요. 밀고 나가는 힘을 말해요"],
  ["여왕", "돌보는 사람이에요. 안으로 익은 힘을 말해요"],
  ["왕", "이끄는 사람이에요. 책임지고 정하는 힘을 말해요"],
] as const;

function suitOf(id: number): { suit: Suit; rank: number } {
  if (id < 22) return { suit: "major", rank: id };
  return { suit: suitOrder[Math.floor((id - 22) / 14)], rank: (id - 22) % 14 };
}

export type TarotBasisRow = { term: string; value: string; plain: string };

export function tarotBasis(id: number, reversed: boolean, locale: string = "ko"): TarotBasisRow[] {
  if (!TAROT_DECK[id]) return [];
  if (tarotLang(locale) === "en") return tarotBasisEn(id, reversed);
  const { suit, rank } = suitOf(id);
  const rows: TarotBasisRow[] = [];
  if (suit === "major") {
    rows.push({
      term: "카드 종류",
      value: `메이저 아르카나 ${rank}번`,
      plain: "스물두 장뿐인 큰 흐름 카드예요. 하루의 일보다 지금 지나는 주제를 짚어요",
    });
  } else {
    const info = suits[suit];
    rows.push({ term: "카드 종류", value: `마이너 아르카나 · ${info.name}(${info.element})`, plain: info.plain });
    if (rank < 10)
      rows.push({ term: "숫자", value: String(rank + 1), plain: `열 단계 중 ${rank + 1}번째, ${steps[rank]}예요` });
    else rows.push({ term: "인물", value: court[rank - 10][0], plain: court[rank - 10][1] });
  }
  rows.push({
    term: "방향",
    value: reversed ? "역방향" : "정방향",
    plain: reversed
      ? "카드 뜻이 늦어지거나 안으로 향해요. 나쁜 카드라는 뜻은 아니에요"
      : "카드 뜻이 그대로 드러나요",
  });
  return rows;
}

/** 풀이 표의 연애·일·돈 줄에 덧붙이는 문장. 무늬가 그 영역에서 무엇을 말하는지. 조언 줄에는 붙이지 않는다. */
const suitDomain: Record<Suit, Record<"연애" | "일" | "돈", string>> = {
  major: {
    연애: "큰 흐름 카드라 오늘 하루의 일보다 관계가 가는 방향을 봐요.",
    일: "큰 흐름 카드라 당장의 일보다 가는 방향을 점검해요.",
    돈: "큰 흐름 카드라 오늘 지출보다 돈을 대하는 태도를 봐요.",
  },
  wands: {
    연애: "행동의 카드라 먼저 움직이는 쪽이 흐름을 만들어요.",
    일: "의욕의 카드라 시작하는 힘이 붙어요.",
    돈: "속도가 빠른 카드라 쓰는 것도 빨라져요.",
  },
  cups: {
    연애: "마음의 카드라 느낀 것을 말로 건네면 닿아요.",
    일: "마음의 카드라 같이 일하는 사람과의 분위기가 결과를 정해요.",
    돈: "마음의 카드라 기분에 따라 지갑이 열려요.",
  },
  swords: {
    연애: "생각의 카드라 말 한마디의 무게가 커져요.",
    일: "판단의 카드라 정리하고 결정하는 일에 좋아요.",
    돈: "따져 보는 카드라 비교하고 계산한 뒤 움직여요.",
  },
  pentacles: {
    연애: "일상의 카드라 꾸준히 챙기는 행동이 마음을 전해요.",
    일: "쌓는 카드라 눈에 보이는 결과가 차곡차곡 남아요.",
    돈: "돈과 몸의 카드라 실제 숫자를 확인하면 답이 나와요.",
  },
};

export function tarotRowMore(id: number, label: string) {
  if (!TAROT_DECK[id]) return null;
  const domain = /^[A-Za-z]/.test(label) ? suitDomainEn : suitDomain;
  return (domain[suitOf(id).suit] as Record<string, string | undefined>)[label] ?? null;
}

const detailVoice = {
  changha: { advice: " 줘", fact: "", point: " 하면 돼" },
  elina: { advice: "요", fact: "요", point: " 해 보세요" },
  yuna: { advice: "", fact: "", point: " 챙겨" },
  dosa: { advice: "", fact: "", point: "부터 살피시오" },
} as const;

const casualVerb: Record<string, string> = {
  하: "해", 보: "봐", 두: "둬", 적: "적어", 주: "줘", 쓰: "써", 보내: "보내", 추: "춰",
  누: "눠", 듣: "들어", 내: "내", 걸: "걸어", 쉬: "쉬어", 기: "겨",
  걷: "걸어", 가: "가", 찾: "찾아", 리: "려", 키: "켜", 않: "않아", 묻: "물어",
  들: "들어", 쌓: "쌓아", 피: "펴", 있: "있어", 열: "열어", 풀: "풀어", 짜: "짜",
  받: "받아", 우: "워", 놓: "놔", 갖: "가져", 히: "혀", 재: "재", 개: "개",
  덮: "덮어", 찍: "찍어", 짚: "짚어", 넣: "넣어", 잡: "잡아", 닫: "닫아", 이: "여",
  훑: "훑어", 지: "져", 믿: "믿어", 빼: "빼", 오: "와", 읽: "읽어", 말: "말아",
  꾸: "꿔", 지키: "지켜", 붙이: "붙여", 비우: "비워", 피우: "피워", 세우: "세워", 고르: "골라", 따르: "따라", 미루: "미뤄",
};

export function tarotDetail(text: string, character: TarotCharacter, locale: string): string {
  if (tarotLang(locale) !== "ko") return text;
  const voice = detailVoice[character];
  const line = text.replace(/\.$/, "");
  if (line.endsWith("기")) {
    const stem = line.slice(0, -1);
    const tail = stem.slice(-1);
    const suffix = [stem.slice(-2), tail].find((part) => Object.hasOwn(casualVerb, part));
    const casual = suffix && casualVerb[suffix];
    if (suffix && casual) {
      const action = stem.slice(0, -suffix.length) + casual;
      if (character === "dosa" && action.endsWith("봐")) return action.slice(0, -1) + "보시오.";
      if (action.endsWith("봐")) return `${action}${voice.fact}.`;
      if (character === "dosa") {
        const hasFinal = (tail.charCodeAt(0) - 0xac00) % 28 !== 0;
        const formal = stem.endsWith("듣") || stem.endsWith("걷") || stem.endsWith("묻")
          ? stem.slice(0, -1) + ({ 듣: "들", 걷: "걸", 묻: "물" })[tail]
          : stem.replace(/([걸들열풀말])$/, (word) => ({ 걸: "거", 들: "드", 열: "여", 풀: "푸", 말: "마" })[word] ?? word);
        return `${formal}${hasFinal && (formal === stem || /[듣걷묻]$/.test(stem)) ? "으" : ""}시오.`;
      }
      return `${action}${action.endsWith("줘") ? voice.fact : voice.advice}.`;
    }
  }
  if (line.endsWith("요")) {
    if (character === "elina") return text;
    if (character === "dosa") {
      const facts: Record<string, string> = {
        봐요: "보시오", 점검해요: "점검하시오", 만들어요: "만드오", 붙어요: "붙소",
        빨라져요: "빨라지오", 닿아요: "닿소", 정해요: "정하오", 열려요: "열리오",
        커져요: "커지오", 좋아요: "좋소", 움직여요: "움직이시오", 전해요: "전하오",
        남아요: "남소", 나와요: "나오",
      };
      return line.replace(/[^ ]+요$/, (word) => facts[word] ?? word) + ".";
    }
    return line.slice(0, -1) + ".";
  }
  if (line.endsWith("든다") || line.endsWith("진다")) {
    const statement = line.slice(0, -2) + (line.endsWith("든다") ? "들어" : "져");
    return character === "dosa" ? `${line}고 보면 되오.` : `${statement}${voice.fact}.`;
  }
  return `${line}${voice.point}.`;
}

/* 영어 화면의 근거 줄과 덧붙이는 문장. 영어 풀이 글(cards.en.json)의 줄 이름은 Love · Work · Money · Advice 다. */
const suitsEn: Record<Exclude<Suit, "major">, { name: string; element: string; plain: string }> = {
  wands: { name: "Wands", element: "Fire", plain: "A card of drive and action" },
  cups: { name: "Cups", element: "Water", plain: "A card of feelings and relationships" },
  swords: { name: "Swords", element: "Air", plain: "A card of thoughts and words" },
  pentacles: { name: "Pentacles", element: "Earth", plain: "A card of money, body and daily life" },
};
const stepsEn = [
  "the place of beginning",
  "the place of choosing and finding balance",
  "the place of first results and teamwork",
  "the place of settling and pausing",
  "the place of clashing and shaking",
  "the place of recovering and sharing",
  "the place of looking back and being tested",
  "the place of moving and practicing",
  "the place of being almost there",
  "the place of finishing and moving on",
] as const;
const courtEn = [
  ["Page", "The learner. It speaks of new news and first tries"],
  ["Knight", "The mover. It speaks of the strength to push forward"],
  ["Queen", "The carer. It speaks of strength ripened within"],
  ["King", "The leader. It speaks of the strength to take charge and decide"],
] as const;
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

function tarotBasisEn(id: number, reversed: boolean): TarotBasisRow[] {
  const { suit, rank } = suitOf(id);
  const rows: TarotBasisRow[] = [];
  if (suit === "major") {
    rows.push({
      term: "Card type",
      value: `Major Arcana ${rank}`,
      plain: "One of only 22 big-picture cards. It points to the theme you're going through, more than the events of the day",
    });
  } else {
    const info = suitsEn[suit];
    rows.push({ term: "Card type", value: `Minor Arcana · ${info.name} (${info.element})`, plain: info.plain });
    if (rank < 10)
      rows.push({ term: "Number", value: String(rank + 1), plain: `The ${ordinal(rank + 1)} of ten steps: ${stepsEn[rank]}` });
    else rows.push({ term: "Figure", value: courtEn[rank - 10][0], plain: courtEn[rank - 10][1] });
  }
  rows.push({
    term: "Direction",
    value: reversed ? "Reversed" : "Upright",
    plain: reversed
      ? "The meaning is delayed or turns inward. It doesn't make it a bad card"
      : "The meaning shows as it is",
  });
  return rows;
}

const suitDomainEn: Record<Suit, Record<"Love" | "Work" | "Money", string>> = {
  major: {
    Love: "As a big-picture card, it looks at where the relationship is heading rather than today alone.",
    Work: "As a big-picture card, it checks your direction more than the task at hand.",
    Money: "As a big-picture card, it looks at how you treat money more than today's spending.",
  },
  wands: {
    Love: "As a card of action, whoever moves first shapes the flow.",
    Work: "As a card of drive, you gain the strength to start.",
    Money: "As a fast card, spending speeds up too.",
  },
  cups: {
    Love: "As a card of feeling, putting what you feel into words reaches them.",
    Work: "As a card of feeling, the mood with the people you work with decides the result.",
    Money: "As a card of feeling, your wallet opens with your mood.",
  },
  swords: {
    Love: "As a card of thought, the weight of a single word grows.",
    Work: "As a card of judgment, it's good for sorting things out and deciding.",
    Money: "As a card of weighing things up, compare and calculate before you move.",
  },
  pentacles: {
    Love: "As a card of daily life, steady small acts of care carry your heart.",
    Work: "As a card of building, visible results pile up bit by bit.",
    Money: "As a card of money and body, checking the real numbers gives you the answer.",
  },
};
