export const fortunePath = "/chemi/fortune";
export const sajuPath = "/chemi/saju";
export const tarotPath = "/chemi/tarot";

export const entries = [
  ["fortune", "readings", fortunePath],
  ["saju", "readings", sajuPath],
  ["zodiac", "readings", null],
  ["tarot", "readings", tarotPath],
  ["pair", "games", null],
  ["run", "games", null],
] as const;
