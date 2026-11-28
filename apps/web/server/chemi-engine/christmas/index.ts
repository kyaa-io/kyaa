import reference from "./reference.json";
import { computeDailyFortune } from "../fortune";
import { scoreDay } from "../star/score";

import { christmasSeason } from "@/features/chemi/domain/christmas-season";

export function computeChristmasReading(
  chart: Parameters<typeof computeDailyFortune>[0],
  natal: Parameters<typeof scoreDay>[0],
  now: Date,
) {
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const holidays = christmasSeason.holidayDates.map(date => ({
    date, fortune: computeDailyFortune(chart, date),
  }));
  const [eve, christmas] = holidays;
  if (eve!.fortune.locked || christmas!.fortune.locked) return { locked: true } as const;
  const bestFortune = eve!.fortune.fields.love >= christmas!.fortune.fields.love
    ? eve!.fortune : christmas!.fortune;
  const stars = christmasSeason.holidayDates.map(date => ({ date, reading: scoreDay(natal, date) }));
  const bestStar = stars[0]!.reading.stars.love >= stars[1]!.reading.stars.love ? stars[0]! : stars[1]!;
  const remaining = [];
  for (let day = 1; day <= 23; day++) {
    const date = `2026-12-${String(day).padStart(2, "0")}`;
    if (date < today) continue;
    const fortune = computeDailyFortune(chart, date);
    if (!fortune.locked) remaining.push({ date, love: fortune.fields.love });
  }
  const opportunityCount = remaining.filter(day => day.love >= 80).length;
  const bonus = [eve!.fortune, christmas!.fortune].some(day => day.evidence.spirit === "년살") ? 5 : 0;
  const score = Math.min(100, Math.round(
    45 * (bestFortune.fields.love - 50) / 48
    + 35 * (bestStar.reading.stars.love - 1) / 4
    + 20 * opportunityCount / 23 + bonus,
  ));
  return {
    locked: false, score, opportunityCount,
    grade: reference.cuts.filter(boundary => score > boundary).length,
    topPercent: Math.min(100, Math.ceil((1 + reference.histogram.slice(score + 1).reduce((sum, n) => sum + n, 0)) / 12)),
    fortuneDate: bestFortune === eve!.fortune ? eve!.date : christmas!.date,
    fortune: bestFortune, star: bestStar,
    opportunityDates: remaining.sort((a, b) => b.love - a.love).slice(0, 2).map(day => day.date),
  } as const;
}
