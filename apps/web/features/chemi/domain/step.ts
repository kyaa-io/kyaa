/** 오늘의 운세 대화 단계. 주소의 `step` 값과 같다(arch-chemi §4.2). */
export const fortuneSteps = [
  "enter",
  "calc",
  "talk-1",
  "talk-2",
  "talk-3",
  "talk-4",
  "result",
] as const;
export type FortuneStep = (typeof fortuneSteps)[number];

export function parseFortuneStep(value: string | null | undefined): FortuneStep {
  return fortuneSteps.find((step) => step === value) ?? "enter";
}

/**
 * 결과를 아직 받지 못했으면 대화·결과 단계로 갈 수 없다.
 * 계산 중(calc)은 새로 고침해도 입장으로 돌아가서 다시 시작한다.
 */
export function reachableFortuneStep(
  step: FortuneStep,
  hasReading: boolean,
): FortuneStep {
  if (hasReading) return step === "calc" ? "talk-1" : step;
  return "enter";
}

export function nextFortuneStep(step: FortuneStep): FortuneStep {
  const index = fortuneSteps.indexOf(step);
  return fortuneSteps[Math.min(index + 1, fortuneSteps.length - 1)];
}

export function talkNumber(step: FortuneStep): 1 | 2 | 3 | 4 | null {
  const match = /^talk-([1-4])$/.exec(step);
  return match ? (Number(match[1]) as 1 | 2 | 3 | 4) : null;
}
