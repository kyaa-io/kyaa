import "server-only";
import { Ecliptic, GeoVector } from "astronomy-engine";
import launchCuts from "./launch-cuts.json";
import { bodies, calculateChart, dailySky, normalize, separation } from "./chart";

type Chart = ReturnType<typeof calculateChart>;
const domains = ["love", "money", "work", "people"] as const;
type Domain = typeof domains[number];
type Metric = Domain | "overall";
export type Distribution = { version: string; cuts: Record<Metric, readonly [number, number, number, number]> };
const orbs = [2, 4, 2, 2, 2, 1.5, 1.5, 1, 1, 1];
const weights = [1, 1, 1, 1, 1, 1.2, 1.2, 1.4, 1.4, 1.4];
const aspects = [[0, 1], [60, .6], [90, -.8], [120, 1], [180, -1]] as const;
const rules = [
  { domain: "love", planets: ["Venus"], houses: [5, 7] },
  { domain: "money", planets: ["Jupiter"], houses: [2, 8] },
  { domain: "work", planets: ["Saturn", "Mars"], houses: [6, 10] },
  { domain: "people", planets: ["Mercury"], houses: [3, 11] },
] as const;

export function dailyRaw(natal: Chart, sky: ReturnType<typeof dailySky>) {
  const targets = natal.planets.slice(0, 7).map(p => ({ name: String(p.body), longitude: p.longitude,
    weight: p.body === "Sun" || p.body === "Moon" ? 1.5 : 1 }));
  if (natal.ascendant !== null) targets.push({ name: "ASC", longitude: natal.ascendant, weight: 1.5 });
  if (natal.midheaven !== null) targets.push({ name: "MC", longitude: natal.midheaven, weight: 1 });
  const raw = { love: 0, money: 0, work: 0, people: 0, overall: 0 };
  const reasons = [];
  for (const [i, body] of bodies.entries()) for (const target of targets) for (const [angle, weight] of aspects) {
    const errors = sky.map(h => Math.abs(separation(h.planets[i]!.longitude, target.longitude) - angle));
    const error = Math.min(...errors);
    if (error >= orbs[i]!) continue;
    const hour = errors.indexOf(error);
    const applying = hour > 0 ? error < errors[hour - 1]! : errors[1]! < error;
    const score = weights[i]! * weight * (1 - error / orbs[i]!) * target.weight * (applying ? 1.1 : .9);
    const house = natal.wholeSignCusps ? 1 + Math.floor(normalize(sky[hour]!.planets[i]!.longitude - natal.wholeSignCusps[0]!) / 30) : 0;
    for (const rule of rules) {
      if ((rule.planets as readonly string[]).includes(body) || (rule.houses as readonly number[]).includes(house)) raw[rule.domain] += score;
    }
    reasons.push({ targetLongitude: target.longitude, body, target: target.name, angle, hour, applying, score });
  }
  raw.overall = domains.reduce((sum, domain) => sum + raw[domain], 0);
  return { raw, reasons: reasons.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5) };
}

export function scoreDay(natal: Chart, date: string, distribution?: Distribution) {
  const table = distribution ?? launchCuts;
  const result = dailyRaw(natal, dailySky(date));
  const stars = { ...result.raw };
  for (const metric of [...domains, "overall"] as const)
    stars[metric] = 1 + table.cuts[metric].filter(cut => result.raw[metric] > cut).length;
  const reasons = result.reasons.map(reason => {
    const orb = orbs[bodies.indexOf(reason.body)]!;
    const peak = Date.parse(date + "T00:00:00+09:00") + reason.hour * 3600000;
    // Sample at the same hourly resolution as the daily sky.
    for (let t = peak + 3600000; ; t += 3600000) {
      const longitude = Ecliptic(GeoVector(reason.body, new Date(t), true)).elon;
      if (Math.abs(separation(longitude, reason.targetLongitude) - reason.angle) > orb)
        return { ...reason, exitDate: new Date(t + 9 * 3600000).toISOString().slice(0, 10) };
    }
  });
  return { ...result, reasons, stars, distributionVersion: table.version };
}
