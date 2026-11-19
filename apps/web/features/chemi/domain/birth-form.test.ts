import { describe, expect, it } from "vitest";
import {
  bandInfo, birthDateIssue, birthRequest, birthTextToIso, daysInMonth, draftFromBirth, formatBirthDigits, koreaToday, sameDraft, timeFromApi, timeToApi,
} from "./birth-form";
import { searchBirthPlaces } from "./birth-places";

const today = "2026-11-18";

describe("birth input rules", () => {
  it("puts dots into eight digits and ignores everything else", () => {
    expect(formatBirthDigits("1995")).toBe("1995");
    expect(formatBirthDigits("199505")).toBe("1995.05");
    expect(formatBirthDigits("19950505")).toBe("1995.05.05");
    expect(formatBirthDigits("1995-05-05 12")).toBe("1995.05.05");
    expect(birthTextToIso("1995.05.05")).toBe("1995-05-05");
    expect(birthTextToIso("1995.05")).toBeNull();
  });

  it("judges a date: incomplete, not real, future, before 1900, under 14", () => {
    expect(birthDateIssue("1995.05", today)).toBe("incomplete");
    expect(birthDateIssue("1995.02.30", today)).toBe("invalid");
    expect(birthDateIssue("1995.13.01", today)).toBe("invalid");
    expect(birthDateIssue("1899.12.31", today)).toBe("invalid");
    expect(birthDateIssue("2026.11.19", today)).toBe("invalid");
    expect(birthDateIssue("2015.01.01", today)).toBe("under14");
    expect(birthDateIssue("1995.05.05", today)).toBeNull();
    expect(birthDateIssue("2000.02.29", today)).toBeNull();
  });

  it("turns 14 on the birthday itself", () => {
    expect(birthDateIssue("2012.11.18", today)).toBeNull();
    expect(birthDateIssue("2012.11.19", today)).toBe("under14");
  });

  it("counts days of the chosen month, leap years included", () => {
    expect([daysInMonth(2024, 2), daysInMonth(2025, 2), daysInMonth(2025, 4), daysInMonth(2025, 12)]).toEqual([29, 28, 30, 31]);
  });

  it("reads the Korean calendar day around the UTC boundary", () => {
    expect(koreaToday(new Date("2026-11-18T14:59:59Z"))).toBe("2026-11-18");
    expect(koreaToday(new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-19");
  });
});

describe("time values", () => {
  it("maps exact, band and unknown to the API and back", () => {
    expect(timeToApi({ kind: "exact", hour: 14, minute: 30 })).toEqual({ birthTime: "14:30", timePrecision: "exact" });
    expect(timeToApi({ kind: "band", band: 0 })).toEqual({ birthTime: "00:00", timePrecision: "band" });
    expect(timeToApi({ kind: "band", band: 11 })).toEqual({ birthTime: "22:00", timePrecision: "band" });
    expect(timeToApi({ kind: "unknown" })).toEqual({ birthTime: null, timePrecision: "unknown" });
    expect(timeFromApi("14:30", "exact")).toEqual({ kind: "exact", hour: 14, minute: 30 });
    expect(timeFromApi("02:00", "band")).toEqual({ kind: "band", band: 1 });
    expect(timeFromApi(null, "unknown")).toEqual({ kind: "unknown" });
  });

  it("names the twelve two-hour bands starting at 23:00", () => {
    expect(bandInfo(0)).toEqual({ name: "자시", range: "23:00–01:00" });
    expect(bandInfo(11)).toEqual({ name: "해시", range: "21:00–23:00" });
  });
});

describe("draft", () => {
  const birth = { birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울특별시", ageBand: "adult", editableFrom: null } as const;
  it("round-trips a stored birth and builds the PUT body with consent", () => {
    const draft = draftFromBirth(birth);
    expect(draft).toEqual({ dateText: "1995.05.05", calendar: "solar", time: { kind: "exact", hour: 14, minute: 30 }, gender: "female", place: "서울특별시" });
    expect(birthRequest(draft)).toEqual({ birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울특별시", consent: true });
    expect(sameDraft(draft, { ...draft })).toBe(true);
    expect(sameDraft(draft, { ...draft, place: null })).toBe(false);
  });
});

describe("place search", () => {
  const places = ["서울특별시", "수원시", "도쿄"];
  it("filters by contained text and lists all for an empty query", () => {
    expect(searchBirthPlaces(places, "서")).toEqual(["서울특별시"]);
    expect(searchBirthPlaces(places, " 시")).toEqual(["서울특별시", "수원시"]);
    expect(searchBirthPlaces(places, "")).toEqual(places);
    expect(searchBirthPlaces(places, "뉴욕")).toEqual([]);
  });
});
