import { expect, it, vi } from "vitest";
import launch from "./launch-cuts.json";
import reference from "./reference.test.json";
import { calculateChart, dailySky } from "./index";
import { dailyRaw, launchStars, tieRank } from "./score";

vi.mock("server-only", () => ({}));

it.each([true, false])("balances all five star bands (known time %s)", timeKnown => {
  const charts = reference.cases.map(c => calculateChart({ ...c, instant: new Date(c.instant), timeKnown }));
  const rows = [];
  for (let day = 1; day <= 30; day++) {
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    const sky = dailySky(date);
    for (const chart of charts) {
      const { raw } = dailyRaw(chart, sky);
      rows.push({ raw, date, chart, stars: launchStars(chart, date, raw) });
    }
  }
  expect(rows).toHaveLength(1200);
  for (const metric of ["love", "work", "money", "people", "overall"] as const) {
    const pairs = rows.map(r => [r.raw[metric], tieRank(r.chart, r.date, metric)] as const)
      .sort(([a, i], [b, j]) => a - b || i - j);
    const cuts = [240, 480, 720, 960].map(n => pairs[n - 1]);
    expect(cuts).toEqual(launch[timeKnown ? "known" : "unknown"][metric]);
    for (const star of [1, 2, 3, 4, 5]) {
      const count = rows.filter(r => r.stars[metric] === star).length;
      expect(count).toBeGreaterThanOrEqual(204);
      expect(count).toBeLessThanOrEqual(276);
    }
  }
});

it.each([[0, false], [12, false], [23, true]] as const)(
  "scores a Moon conjunction peaking at %i in the unknown-time overall score", (peak, applying) => {
    const chart = calculateChart({ instant: new Date("2000-01-01Z"), timeKnown: false, latitude: 0, longitude: 0 });
    chart.planets = [{ ...chart.planets[0]!, longitude: 100 }];
    const sky = dailySky("2026-11-01");
    for (const sample of sky) for (const planet of sample.planets)
      planet.longitude = planet.body === "Moon" ? 100 + (sample.hour - peak) / 2 : 130;
    const { reasons, raw } = dailyRaw(chart, sky);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ body: "Moon", hour: peak, applying });
    expect(raw).toEqual({ love: 0, work: 0, money: 0, people: 0, overall: applying ? 1.5 : -1.5 });
  },
);
