import { expect, it, vi } from "vitest";
import launch from "./launch-cuts.json";
import reference from "./reference.test.json";
import { calculateChart, dailySky } from "./index";
import { dailyRaw } from "./score";

vi.mock("server-only", () => ({}));

it("reproduces the launch distribution from 1,200 simulated results", () => {
  const charts = reference.cases.map(c => calculateChart({
    ...c, instant: new Date(c.instant), timeKnown: true,
  }));
  const rows = [];
  for (let day = 1; day <= 30; day++) {
    const sky = dailySky(`2026-11-${String(day).padStart(2, "0")}`);
    for (const chart of charts) rows.push(dailyRaw(chart, sky).raw);
  }
  for (const metric of ["love", "work", "money", "people", "overall"] as const) {
    const values = rows.map(row => row[metric]).sort((a, b) => a - b);
    [1, 2, 3, 4].forEach((q, i) => {
      expect(values[q * values.length / 5 - 1]).toBeCloseTo(launch.cuts[metric][i]!, 9);
    });
  }
});
