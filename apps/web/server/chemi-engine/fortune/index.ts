import "server-only";

/** v55 04-3: persisted readings must retain their original table version. */
export const FORTUNE_TABLE_VERSION = "v55-grades-1";
export const FORTUNE_GRADES = [
  { min: 50, max: 59, name: "쉬어 가는 날" },
  { min: 60, max: 69, name: "조심하면 괜찮은 날" },
  { min: 70, max: 79, name: "무난한 날" },
  { min: 80, max: 89, name: "좋은 날" },
  { min: 90, max: 98, name: "아주 좋은 날" },
] as const;

export function fortuneGrade(score: number) {
  if (!Number.isInteger(score) || score < 50 || score > 98) {
    throw new RangeError("Fortune score must be an integer from 50 through 98");
  }
  return FORTUNE_GRADES.find((grade) => score <= grade.max)!;
}
