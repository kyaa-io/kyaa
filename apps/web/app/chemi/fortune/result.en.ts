import type { FortuneEvidence, FortuneField } from "./depth";
import type { Band } from "./result-copy";

export const englishFieldNotes: Record<FortuneField, Record<Band, string>> = {
  fandom: { high: "Make time for a favorite performance or a deep dive.", mid: "Pick one thing you’ve been looking forward to.", low: "Revisit a favorite before starting something new." },
  people: { high: "If someone offers help, take them up on it.", mid: "Have a short chat with someone you feel at ease with.", low: "Give yourself room to listen before you reply." },
  work: { high: "Use the momentum to learn or organize your notes.", mid: "Keep going at your usual pace.", low: "Break the hardest task into smaller steps." },
  rest: { high: "A little movement can help you feel refreshed.", mid: "Take breaks before you feel tired.", low: "Keep the evening quiet and give yourself time to sleep." },
  love: { high: "Reach out first and say what you mean simply.", mid: "A warm reply is enough today.", low: "Give a difficult conversation another day." },
  money: { high: "Enjoy small gains and give large purchases a day.", mid: "Review expenses before buying anything extra.", low: "Put off impulse purchases for today." },
};

export const englishStages: Record<string, [string, string]> = {
  장생: ["Birth", "Start small with something new."],
  목욕: ["Bathing", "A change in mood can sway your plans. Take another look before deciding."],
  관대: ["Coming of age", "Preparation helps you make a good impression."],
  건록: ["Establishment", "Tasks you can handle independently are a good fit."],
  제왕: ["Peak", "Energy is high. Give others a say before pushing ahead."],
  쇠: ["Decline", "Polish what’s underway and give the finishing touches time."],
  병: ["Illness", "Work at a comfortable pace and make room to rest."],
  사: ["Death", "Set aside time to wrap up unfinished tasks."],
  묘: ["Tomb", "It’s a good time to gather and save what matters."],
  절: ["Severance", "Let go of an old commitment to make room for a new one."],
  태: ["Conception", "Give an early idea room to develop in private."],
  양: ["Nurture", "Keep at it and give the results time to show."],
};

export const englishSpirits: Record<string, [string, string]> = {
  겁살: ["Friction", "Pause before replying when opinions differ."],
  재살: ["Loss prevention", "Double-check where you put your belongings."],
  천살: ["Outside influences", "Leave room for changes you can’t control."],
  지살: ["Movement", "A change of place can help you get started."],
  년살: ["Visibility", "Step forward if there’s something you want to share."],
  월살: ["Low energy", "Set aside a break before the day fills up."],
  망신살: ["Exposure", "Read messages once more before sending them."],
  장성살: ["Leadership", "Take the lead or volunteer to present."],
  반안살: ["Stability", "Familiar people and routines can help you settle in."],
  역마살: ["Travel", "Leave extra time between stops."],
  육해살: ["Small setbacks", "Give yourself a little room for inconveniences."],
  화개살: ["Solitude", "A quiet place can help you focus on a hobby or study."],
};

const englishValues: Record<string, string> = {
  초록: "Green", 빨강: "Red", 노랑: "Yellow", 하양: "White", 검정: "Black",
  동: "East", 남: "South", 중앙: "Center", 서: "West", 북: "North",
  "나무 연필": "Wooden pencil", "빨간 펜": "Red pen", "도자기 컵": "Ceramic cup", "금속 책갈피": "Metal bookmark", 물병: "Water bottle",
  목: "Wood", 화: "Fire", 토: "Earth", 금: "Metal", 수: "Water",
};

export const englishValue = (value: string) => englishValues[value];

const headline: Record<string, string> = {
  비견: "Someone is on your side", 겁재: "Look after your share", 식신: "Make time for what you enjoy",
  상관: "You have something to say", 편재: "Keep an eye out for a surprise opportunity",
  정재: "Small gains add up", 편관: "A day for taking responsibility", 정관: "Take it in order",
  편인: "Make room to think", 정인: "Someone offers help first",
};

export const englishHeadline = (score: number, god: string) =>
  score < 60 ? "Slow down to keep going" : headline[god];

const relations: Record<string, [string, string]> = {
  육합: ["Pairing", "The day and your birth-day branch support each other."],
  삼합: ["Three-way harmony", "Three branches work together and strengthen the pattern."],
  반합: ["Partial harmony", "The branches work together and offer some support."],
  충: ["Clash", "Plans may shift. Leave a little room to adjust."],
  형: ["Friction", "Small disagreements are easier to manage if you give them time."],
  해: ["Mismatch", "Check that you’ve understood each other."],
  원진: ["Tension", "Give yourself some space if an interaction feels uncomfortable."],
  복음: ["Repeated branch", "A familiar pattern may come up again."],
};

export function englishFortuneBasis(evidence: FortuneEvidence) {
  const [relation, explanation] = relations[evidence.relation] ?? ["Neutral", "The branches neither reinforce nor clash with each other."];
  return [
    { term: "Day pattern", value: englishHeadline(60, evidence.tenGod) ?? "Daily influences", plain: "The day’s stem is compared with your birth-day stem." },
    { term: "Branch relationship", value: relation, plain: explanation },
    { term: "Supportive element", value: englishValue(evidence.useful) ?? "—", plain: "The daily score rises when this element appears in the day’s pattern." },
    { term: "Year influence", value: "Current year", plain: "A year that matches your supportive element raises the baseline score." },
    { term: "Birth time", value: evidence.timeBasis === "시주 포함" ? "Included" : "Unknown", plain: "The hour pillar is included when your birth time is available." },
  ];
}

export function englishFortuneFlow(base: string, evidence: FortuneEvidence) {
  const relation = relations[evidence.relation]?.[1];
  return [base, relation, englishStages[evidence.stage]?.[1]].filter(Boolean).join(" ");
}

export const englishFortuneVoice = {
  changha: "Pick one thing and give it a go. I’m cheering for you.",
  elina: "Take it at your own pace. You’re doing fine.",
  yuna: "Pick what matters most and do that first.",
  dosa: "Let the day’s strongest area guide where you put your effort.",
};
