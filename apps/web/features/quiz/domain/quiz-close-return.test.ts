import { describe, expect, it } from "vitest";
import { readQuizCloseReturn, rememberQuizCloseReturn, sanitizeCertificationListPath, rememberQuizFocusReturn, clearQuizCloseReturn, certificationListHref, takeQuizFocusReturn } from "./quiz-close-return";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe("quiz close return", () => {
  it("accepts only this creator's certification lists", () => {
    expect(sanitizeCertificationListPath("/c/kara?tab=certifications&locale=en", "kara")).toBe("/c/kara?tab=certifications&locale=en");
    expect(sanitizeCertificationListPath("/c/kara/certifications?locale=ko", "kara")).toBe("/c/kara/certifications?locale=ko");
    for (const bad of ["https://evil.example/c/kara/certifications", "//evil.example", "/c/other/certifications", "/community?creator=other&tab=certifications", "/community?creator=kara&tab=certifications&x=1", "/c/kara/certifications#a", "/c/kara/verify", "/c/kara/certifications\\x", ""]) {
      expect(sanitizeCertificationListPath(bad, "kara")).toBeNull();
    }
  });
  it("remembers, expires, and hands focus over once", () => {
    const s = memory();
    rememberQuizCloseReturn(s, "kara", "/c/kara/certifications?locale=ko", "item-1", 1000);
    expect(readQuizCloseReturn(s, "kara", 2000)).toEqual({ href: "/c/kara/certifications?locale=ko", itemId: "item-1" });
    expect(readQuizCloseReturn(s, "other", 2000)).toBeNull();
    expect(readQuizCloseReturn(s, "kara", 1000 + 31 * 60 * 1000)).toBeNull();
    rememberQuizCloseReturn(s, "kara", "/c/kara/certifications?locale=ko", "item-1");
    expect(readQuizCloseReturn(s, "kara")).toEqual({ href: "/c/kara/certifications?locale=ko", itemId: "item-1" });
    expect(readQuizCloseReturn(s, "kara")).not.toBeNull();
    clearQuizCloseReturn(s);
    expect(readQuizCloseReturn(s, "kara")).toBeNull();
    expect(sanitizeCertificationListPath(certificationListHref("Kara", "ko"), "kara")).toBe("/c/kara?tab=certifications&locale=ko");
    expect(takeQuizFocusReturn(s, "kara")).toBeNull();
    rememberQuizFocusReturn(s, "kara", "item-1");
    expect(takeQuizFocusReturn(s, "kara")).toBe("item-1");
    expect(takeQuizFocusReturn(s, "kara")).toBeNull();
  });
  it("ignores unsafe hrefs", () => {
    const s = memory();
    rememberQuizCloseReturn(s, "kara", "https://evil.example", "x");
    expect(readQuizCloseReturn(s, "kara")).toBeNull();
  });
});
