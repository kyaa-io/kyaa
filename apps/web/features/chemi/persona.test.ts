import { expect, it } from "vitest";
import { chemiPersona } from "./persona";
import ko from "./i18n/locales/ko/chemi.json";

it("엘리나의 사주 인사와 별자리·타로·마무리 대사는 해요체로 끝난다", () => {
  const elina = chemiPersona.elina;
  const lines = [...Object.values(elina.star).flat(), elina.tarotResult.ko, ...Object.values(elina.close)];
  expect(JSON.stringify(ko)).toContain("내가 차근차근 봐 줄게요.");
  for (const line of lines) expect(line).toMatch(/요[.!?]$/u);
});
