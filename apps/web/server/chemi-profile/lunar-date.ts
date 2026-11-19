import "server-only";
import { lunarToSolar } from "manseryeok";

/** 음력·음력 윤달로 적은 날짜가 실제 있는 날인지(없는 윤달, 그 달에 없는 30일 등). 양력은 날짜 형식 검사로 충분하다. */
export function lunarDateExists(birthDate: string, calendar: "solar" | "lunar" | "lunar_leap") {
  if (calendar === "solar") return true;
  const [year, month, day] = birthDate.split("-").map(Number);
  try {
    lunarToSolar(year, month, day, calendar === "lunar_leap");
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}
