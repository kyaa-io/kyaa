import reference from "./reference.json";
import { expect, it, vi } from "vitest";
import { calculateSaju } from "../saju";
import { calculateChart } from "../star/chart";
import { christmasRank, computeChristmasReading } from "./index";

vi.mock("server-only", () => ({}));
// The holiday skies are identical for every birth in the reference population.
vi.mock("../star/chart", async importOriginal => {
  const actual = await importOriginal<typeof import("../star/chart")>();
  const skies = new Map<string, ReturnType<typeof actual.dailySky>>();
  return { ...actual, dailySky(date: string) {
    if (!skies.has(date)) skies.set(date, actual.dailySky(date));
    return skies.get(date)!;
  } };
});

it("reproduces the opening-day reference distribution for 1,200 birthdays", () => {
  const histogram = Array<number>(101).fill(0);
  for (let i = 0; i < 1200; i++) {
    const date = new Date(Date.UTC(1965, 0, 1 + i * 17));
    const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
    const hour = i % 24;
    const chart = calculateSaju({ year, month, day, hour, minute: 0 });
    const gender = i % 2 ? "female" : "male";
    const natal = calculateChart({ instant: new Date(Date.UTC(year, month - 1, day, hour - 9)),
      timeKnown: true, latitude: 37.5665, longitude: 126.978 });
    const reading = computeChristmasReading({ ...chart, gender }, natal, new Date("2026-12-01T00:00:00+09:00"));
    if (reading.locked) throw Error("Unexpected locked reference chart");
    histogram[reading.score]!++;
  }
  expect(histogram).toEqual(reference.histogram);
  const sorted = histogram.flatMap((count, score) => Array<number>(count).fill(score));
  expect([239, 479, 719, 959].map(index => sorted[index])).toEqual(reference.cuts);
}, 240000);

it.each([
  [0, 0, 100],
  [40, 0, 79],
  [41, 1, 78],
  [53, 1, 59],
  [54, 2, 57],
  [62, 2, 39],
  [63, 3, 38],
  [73, 3, 19],
  [74, 4, 17],
  [100, 4, 1]
])("fixes score %i to grade %i and top %i percent", (score, grade, topPercent) => {
  expect(christmasRank(score)).toEqual({ grade, topPercent });
});
