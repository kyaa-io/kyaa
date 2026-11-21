/**
 * 타로 카드의 근거 줄: 카드 번호에서 알 수 있는 것(큰 흐름 카드인지, 어느 무늬·몇 번인지, 방향)만 쓴다.
 * 카드마다 쓴 풀이 글(content/chemi/tarot/cards.json)에 덧붙이는 문장이고, 같은 카드·같은 방향이면 같은 문장이 나온다.
 */
import { TAROT_DECK } from "./deck";

type Suit = "major" | "wands" | "cups" | "swords" | "pentacles";

const suits: Record<Exclude<Suit, "major">, { name: string; element: string; plain: string }> = {
  wands: { name: "완드", element: "불", plain: "의욕과 행동을 말하는 무늬예요" },
  cups: { name: "컵", element: "물", plain: "마음과 관계를 말하는 무늬예요" },
  swords: { name: "소드", element: "바람", plain: "생각과 말을 말하는 무늬예요" },
  pentacles: { name: "펜타클", element: "흙", plain: "돈과 몸, 일상을 말하는 무늬예요" },
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

export function tarotBasis(id: number, reversed: boolean): TarotBasisRow[] {
  if (!TAROT_DECK[id]) return [];
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
    연애: "행동의 무늬라 먼저 움직이는 쪽이 흐름을 만들어요.",
    일: "의욕의 무늬라 시작하는 힘이 붙어요.",
    돈: "속도가 빠른 무늬라 쓰는 것도 빨라져요.",
  },
  cups: {
    연애: "마음의 무늬라 느낀 것을 말로 건네면 닿아요.",
    일: "마음의 무늬라 같이 일하는 사람과의 분위기가 결과를 정해요.",
    돈: "마음의 무늬라 기분에 따라 지갑이 열려요.",
  },
  swords: {
    연애: "생각의 무늬라 말 한마디의 무게가 커져요.",
    일: "판단의 무늬라 정리하고 결정하는 일에 좋아요.",
    돈: "따져 보는 무늬라 비교하고 계산한 뒤 움직여요.",
  },
  pentacles: {
    연애: "일상의 무늬라 꾸준히 챙기는 행동이 마음을 전해요.",
    일: "쌓는 무늬라 눈에 보이는 결과가 차곡차곡 남아요.",
    돈: "돈과 몸의 무늬라 실제 숫자를 확인하면 답이 나와요.",
  },
};

export function tarotRowMore(id: number, label: string) {
  if (!TAROT_DECK[id]) return null;
  return (suitDomain[suitOf(id).suit] as Record<string, string | undefined>)[label] ?? null;
}
