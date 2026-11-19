/** 별자리 운세 대화 단계. 주소의 `step` 값과 같다(arch-chemi §4.2). */
export const starSteps = [
  "enter",
  "calc",
  "talk-1",
  "talk-2",
  "talk-3",
  "talk-4",
  "result",
  "chart",
] as const;
export type StarStep = (typeof starSteps)[number];

export function parseStarStep(value: string | null | undefined): StarStep {
  return starSteps.find((step) => step === value) ?? "enter";
}

/**
 * 결과를 아직 받지 못했으면 대화·결과·차트 단계로 갈 수 없다.
 * 계산 중(calc) 주소는 결과가 없으면 화면이 같은 요청을 다시 이어 간다(같은 날 같은 최애는 저장된 결과를 돌려준다).
 */
export function reachableStarStep(step: StarStep, hasReading: boolean): StarStep {
  if (hasReading) return step === "calc" ? "talk-1" : step;
  return "enter";
}

export function nextStarStep(step: StarStep): StarStep {
  const index = starSteps.indexOf(step);
  return starSteps[Math.min(index + 1, starSteps.length - 1)];
}

export function starTalkNumber(step: StarStep): 1 | 2 | 3 | 4 | null {
  const match = /^talk-([1-4])$/.exec(step);
  return match ? (Number(match[1]) as 1 | 2 | 3 | 4) : null;
}
