import "server-only";
import type { ChemiBirthMark } from "@/features/chemi/domain/contracts/profile";
import { calculateSaju } from "@/server/chemi-engine/saju";

const ANIMALS: Record<string, string> = {
  자: "쥐", 축: "소", 인: "호랑이", 묘: "토끼", 진: "용", 사: "뱀", 오: "말", 미: "양", 신: "원숭이", 유: "닭", 술: "개", 해: "돼지",
};
const ELEMENTS: Record<string, NonNullable<ChemiBirthMark>["element"]> = {
  갑: "wood", 을: "wood", 병: "fire", 정: "fire", 무: "earth", 기: "earth", 경: "metal", 신: "metal", 임: "water", 계: "water",
};

/**
 * 생일의 해 기둥(입춘 기준)에서 간지·띠·오행을 읽는다. 입춘 날 시간을 몰라 해가 정해지지 않으면 null.
 * 없는 음력 날짜(이미 저장된 없는 윤달 등)는 표지만 비운다. 이 계산 하나 때문에 프로필 읽기가 막히면 지우기까지 못 한다.
 */
export function birthMark(birth: { birthDate: string; calendar: "solar" | "lunar" | "lunar_leap" }): ChemiBirthMark {
  const [year, month, day] = birth.birthDate.split("-").map(Number);
  let pillars: ReturnType<typeof calculateSaju>["pillars"];
  try {
    ({ pillars } = calculateSaju({ year, month, day, isLunar: birth.calendar !== "solar", isLeapMonth: birth.calendar === "lunar_leap" }));
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  if (!pillars.year) return null;
  const { heavenlyStem: stem, earthlyBranch: branch } = pillars.year;
  return { stem, branch, animal: ANIMALS[branch], element: ELEMENTS[stem] };
}
