import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { luckValue } from "./copy";

const values = ["초록", "빨강", "노랑", "하양", "검정", "동", "남", "중앙", "서", "북", "나무 연필", "빨간 펜", "도자기 컵", "금속 책갈피", "물병"];

describe("fortune luck values in every language", () => {
  it("keeps Korean as is and gives a distinct non-Korean name per value in every other language", () => {
    for (const value of values) expect(luckValue(value, "ko")).toBe(value);
    for (const locale of APP_LOCALES.filter((value) => value !== "ko")) {
      const names = values.map((value) => luckValue(value, locale));
      expect(names.filter((name) => /[가-힣]/.test(name)), locale).toEqual([]);
      expect(new Set(names).size, locale).toBe(values.length);
    }
  });

  it("keeps the English wording the result screen already showed", () => {
    expect(luckValue("나무 연필", "en")).toBe("Wooden pencil");
    expect(luckValue("중앙", "en")).toBe("Center");
  });

  it("leaves an unknown value as is", () => {
    expect(luckValue("무지개", "ja")).toBe("무지개");
  });
});
