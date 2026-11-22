import type { EarthlyBranch, HeavenlyStem } from "manseryeok";

// chemi-saju-2: 균시차 끔(경도 보정만), 신강 지수·도움 기운을 app/chemi/saju/chart 의 공용 함수로 통일.
export const TABLE_VERSION = "chemi-saju-2";
// 본기 우선. 한국식 고정 관법; 자·묘·유는 본기만 사용한다.
export const HIDDEN_STEMS: Record<EarthlyBranch, readonly HeavenlyStem[]> = {
  자: ["계"], 축: ["기", "계", "신"], 인: ["갑", "병", "무"], 묘: ["을"],
  진: ["무", "을", "계"], 사: ["병", "무", "경"], 오: ["정", "기"], 미: ["기", "정", "을"],
  신: ["경", "임", "무"], 유: ["신"], 술: ["무", "신", "정"], 해: ["임", "갑"],
};
export const LIFE_STAGES = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"] as const;
export const LIFE_START: Record<HeavenlyStem, number> = { 갑: 11, 을: 6, 병: 2, 정: 9, 무: 2, 기: 9, 경: 5, 신: 0, 임: 8, 계: 3 };
export const SPIRITS = ["겁살", "재살", "천살", "지살", "년살", "월살", "망신살", "장성살", "반안살", "역마살", "육해살", "화개살"] as const;
export const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;
export const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
const mod = (n: number) => (n % 12 + 12) % 12;
export function lifeStage(stem: HeavenlyStem, branch: EarthlyBranch) {
  const direction = STEMS.indexOf(stem) % 2 === 0 ? 1 : -1;
  return LIFE_STAGES[mod((BRANCHES.indexOf(branch) - LIFE_START[stem]) * direction)];
}
// 연지 삼합 기준: 신자진→사, 인오술→해, 사유축→인, 해묘미→신에서 겁살 시작.
export function spirit(yearBranch: EarthlyBranch, branch: EarthlyBranch) {
  const starts = [5, 2, 11, 8];
  return SPIRITS[mod(BRANCHES.indexOf(branch) - starts[BRANCHES.indexOf(yearBranch) % 4])];
}
export const BRANCH_COMBINATIONS = [["자", "축"], ["인", "해"], ["묘", "술"], ["진", "유"], ["사", "신"], ["오", "미"]] as const;
export const BRANCH_CLASHES = [["자", "오"], ["축", "미"], ["인", "신"], ["묘", "유"], ["진", "술"], ["사", "해"]] as const;
