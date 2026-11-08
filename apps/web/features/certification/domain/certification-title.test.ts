import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { entryQuizName, knownCertificationTitle } from "./certification-title";

it("names the entry quiz in each locale and leaves the creator's own titles alone", () => {
  expect(entryQuizName("ko")).toBe("팬 인증 퀴즈");
  for (const locale of APP_LOCALES) {
    for (const title of ["Official Fan 인증 퀴즈", "Official Fan Quiz"]) {
      const name = knownCertificationTitle(locale, { kind: "quiz", title });
      expect(name).toBeTruthy();
      expect(name).not.toContain("Official");
      if (locale !== "en") expect(name).not.toMatch(/^Fan verification quiz$/);
    }
  }
  expect(knownCertificationTitle("ko", { kind: "manual", title: "Official Fan Quiz" })).toBeNull();
  expect(knownCertificationTitle("ko", { kind: "quiz", title: "KARA 퀴즈" })).toBeNull();
});
