import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { birthMoonSigns, calculateChart, scoreDay, dailySky, separation } from "./index";
import reference from "./reference.test.json";
describe("tropical whole-sign engine", () => {
  for (const fixture of reference.cases) it(`Swiss reference ${fixture.local} ${fixture.zone}`, () => {
    const result = calculateChart({ ...fixture, instant: new Date(fixture.instant), timeKnown: true });
    expect(separation(result.ascendant!, fixture.ascendant)).toBeLessThan(1 / 60);
    expect(separation(result.midheaven!, fixture.midheaven)).toBeLessThan(1 / 60);
    expect(result.wholeSignCusps).toEqual(fixture.cusps);
    result.placidusCusps!.forEach((c, i) => expect(separation(c, fixture.placidus[i]!)).toBeLessThan(1/60));
    result.planets.forEach((planet, index) => {
      expect(separation(planet.longitude, fixture.planets[index]!)).toBeLessThan(1 / 60);
      expect(Math.floor(planet.longitude / 30)).toBe(Math.floor(fixture.planets[index]! / 30));
      const wrap = (d: number) => (d + 360) % 360;
      expect(planet.placidusHouse).toBe(1 + fixture.placidus.findIndex((c, i) =>
        wrap(fixture.planets[index]! - c) < wrap(fixture.placidus[(i + 1) % 12]! - c)));
      expect(planet.wholeSignHouse).toBe(Math.floor(((fixture.planets[index]! - fixture.cusps[0]! + 360) % 360) / 30) + 1);
    });
  });
  it("omits angles and houses without known time", () => {
    const result = calculateChart({ instant: new Date("2000-01-01Z"), timeKnown: false, latitude: 37, longitude: 127 });
    expect(result.ascendant).toBeNull(); expect(result.midheaven).toBeNull(); expect(result.wholeSignCusps).toBeNull();
    expect(result.planets.every(p => p.wholeSignHouse === null)).toBe(true);
  });
  it("samples 24 KST hours and rejects invalid days", () => {
    const sky = dailySky("2026-11-18"); expect(sky).toHaveLength(24);
    expect(sky[0]!.instant).toBe("2026-11-17T15:00:00.000Z");
    expect(() => dailySky("2026-02-30")).toThrow();
  });
});

for (const c of reference.boundaries) it(`ASC boundary ${c.instant} at latitude ${c.latitude}`, () => {
  const asc = calculateChart({ ...c, instant: new Date(c.instant), timeKnown: true }).ascendant!;
  expect(separation(asc, c.ascendant)).toBeLessThan(1/60);
  expect(Math.floor(asc / 30)).toBe(Math.floor(c.ascendant / 30));
});
it.each([-70, 70])("omits display houses at latitude %i", latitude => {
  const chart = calculateChart({ instant: new Date("2000-01-01Z"), latitude, longitude: 0, timeKnown: true });
  expect(chart.placidusCusps).toBeNull();
  expect(chart.planets.every(p => p.placidusHouse === null)).toBe(true);
});
it("scores repeatably with a fixed distribution and no unknown-time angles", () => {
  const chart = calculateChart({ instant: new Date("2000-01-01Z"), latitude: 37, longitude: 127, timeKnown: false });
  const score = scoreDay(chart, "2026-11-18");
  expect(score).toEqual(scoreDay(chart, "2026-11-18"));
  expect(score.reasons).toHaveLength(5);
  expect(score.reasons.every(r => r.target !== "ASC" && r.target !== "MC")).toBe(true);
  expect(score.raw.overall).toBe(score.raw.love + score.raw.money + score.raw.work + score.raw.people);
});
it("returns both Moon signs across a birth-day ingress", () => {
  expect(birthMoonSigns(new Date("1999-12-31Z"), new Date("2000-01-01Z"))).toEqual(["libra", "scorpio"]);
});
