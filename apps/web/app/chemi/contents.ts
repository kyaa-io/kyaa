export const fortunePath = "/chemi/fortune";
export const starPath = "/chemi/star";
export const sajuPath = "/chemi/saju";
export const tarotPath = "/chemi/tarot";

export const entries = [
  ["fortune", "readings", fortunePath],
  ["saju", "readings", sajuPath],
  ["zodiac", "readings", starPath],
  ["tarot", "readings", tarotPath],
  ["pair", "games", "/chemi/games/match"],
  ["run", "games", "/chemi/games/run"],
] as const;

/** 콘텐츠가 주는 친밀 EXP 와 기록 이름. DB `chemi_complete_reading`·`chemi_match_finish`·`chemi_run_finish` 와 같아야 한다. */
export const EARN = { fortune: ["fortune", 10], saju: ["saju", 20], zodiac: ["star", 10], tarot: ["tarot", 10], pair: ["match", 10], run: ["run", 10] } as const;
