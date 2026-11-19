export const fortunePath = "/chemi/fortune";
export const starPath = "/chemi/star";
export const sajuPath = "/chemi/saju";
export const tarotPath = "/chemi/tarot";

export const entries = [
  ["fortune", "readings", fortunePath],
  ["saju", "readings", sajuPath],
  ["zodiac", "readings", starPath],
  ["tarot", "readings", tarotPath],
  ["pair", "games", null],
  ["run", "games", null],
] as const;
