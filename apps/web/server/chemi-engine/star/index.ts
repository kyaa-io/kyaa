import "server-only";
import { Body, Ecliptic, GeoVector, MakeTime, SiderealTime, e_tilt } from "astronomy-engine";

export const bodies = [Body.Sun, Body.Moon, Body.Mercury, Body.Venus, Body.Mars,
  Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto] as const;
export const zodiac = ["aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;
const rad = Math.PI / 180;
export const normalize = (angle: number) => ((angle % 360) + 360) % 360;
export const separation = (a: number, b: number) => Math.abs(normalize(a - b + 180) - 180);

/** Caller resolves civil time (including historical DST) to UTC. Never apply saju's correction. */
export function calculateChart(input: { instant: Date; timeKnown: boolean; latitude: number; longitude: number }) {
  const { instant, latitude, longitude, timeKnown } = input;
  if (!Number.isFinite(instant.getTime()) || instant.getUTCFullYear() < 1900 || instant.getUTCFullYear() > 2100
    || !Number.isFinite(latitude) || Math.abs(latitude) >= 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new RangeError("Invalid star chart input");
  const time = MakeTime(instant);
  const theta = normalize(SiderealTime(time) * 15 + longitude) * rad;
  const epsilon = e_tilt(time).tobl * rad;
  // Meeus, Astronomical Algorithms: intersection of ecliptic and eastern horizon.
  const ascendant = timeKnown ? normalize(Math.atan2(-Math.cos(theta),
    Math.sin(theta) * Math.cos(epsilon) + Math.tan(latitude * rad) * Math.sin(epsilon)) / rad + 180) : null;
  const midheaven = timeKnown ? normalize(Math.atan2(Math.sin(theta), Math.cos(theta) * Math.cos(epsilon)) / rad) : null;
  const wholeSignCusps = ascendant === null ? null : Array.from({ length: 12 }, (_, i) => normalize(Math.floor(ascendant / 30) * 30 + i * 30));
  const planets = bodies.map(body => {
    const longitude = Ecliptic(GeoVector(body, time, true)).elon;
    return { body, longitude, sign: zodiac[Math.floor(longitude / 30)]!,
      wholeSignHouse: wholeSignCusps === null ? null : Math.floor(normalize(longitude - wholeSignCusps[0]!) / 30) + 1 };
  });
  return { zodiacSystem: "tropical" as const, houseSystem: "whole-sign" as const,
    ascendant, midheaven, wholeSignCusps, planets };
}

/** Shared hourly sky for one KST calendar date, independent of server timezone. */
export function dailySky(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Invalid date");
  const midnight = new Date(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(midnight.getTime()) || new Date(midnight.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== date) throw new RangeError("Invalid date");
  return Array.from({ length: 24 }, (_, hour) => {
    const instant = new Date(midnight.getTime() + hour * 3600000);
    return { hour, instant: instant.toISOString(), planets: calculateChart({ instant, timeKnown: false, latitude: 0, longitude: 0 }).planets };
  });
}
