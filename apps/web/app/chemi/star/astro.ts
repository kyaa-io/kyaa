import { bodyNames, zodiacSigns, type ZodiacSign } from "./copy";
import type { StarPlanet } from "./reading";

export const signTrait: Record<ZodiacSign, string> = {
  aries: "용기",
  taurus: "고집",
  gemini: "호기심",
  cancer: "다정함",
  leo: "당당함",
  virgo: "꼼꼼함",
  libra: "균형 감각",
  scorpio: "집중력",
  sagittarius: "자유로움",
  capricorn: "끈기",
  aquarius: "독창성",
  pisces: "상상력",
};

export const elementNames = ["불", "흙", "공기", "물"] as const;
export const modalityNames = ["시작형", "유지형", "변화형"] as const;

/** 별자리 번호(0 양자리 ~ 11 물고기자리). 원소는 번호 % 4, 양식은 번호 % 3이다. */
export function elementCounts(planets: StarPlanet[]) {
  const counts = [0, 0, 0, 0];
  for (const planet of planets) counts[zodiacSigns.indexOf(planet.sign) % 4]! += 1;
  return elementNames.map((name, index) => ({ name, count: counts[index]! }));
}
export function modalityCounts(planets: StarPlanet[]) {
  const counts = [0, 0, 0];
  for (const planet of planets) counts[zodiacSigns.indexOf(planet.sign) % 3]! += 1;
  return modalityNames.map((name, index) => ({ name, count: counts[index]! }));
}

const separation = (a: number, b: number) => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

export type NatalAspect = {
  a: string;
  b: string;
  angle: 60 | 90 | 120 | 180;
  error: number;
};

const angles = [60, 90, 120, 180] as const;
const orb = 6;

/** 타고난 행성끼리의 주요 각도. 오차가 작은 순서. */
export function natalAspects(planets: StarPlanet[]): NatalAspect[] {
  const found: NatalAspect[] = [];
  for (let i = 0; i < planets.length; i++)
    for (let j = i + 1; j < planets.length; j++)
      for (const angle of angles) {
        const error = Math.abs(separation(planets[i]!.longitude, planets[j]!.longitude) - angle);
        if (error <= orb)
          found.push({ a: planets[i]!.body, b: planets[j]!.body, angle, error });
      }
  return found.sort((x, y) => x.error - y.error);
}

export const aspectMeaning: Record<number, string> = {
  60: "육분, 잘 어울림",
  90: "사각, 부딪힘",
  120: "삼각, 잘 어울림",
  180: "충, 줄다리기",
};

export function aspectTitle(a: string, b: string) {
  const first = bodyNames[a] ?? a;
  const second = bodyNames[b] ?? b;
  const last = first.charCodeAt(first.length - 1);
  const withFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${first}${withFinal ? "과" : "와"} ${second}`;
}
