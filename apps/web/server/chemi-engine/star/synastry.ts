import { separation, type calculateChart } from "./chart";

type Planet = Pick<ReturnType<typeof calculateChart>["planets"][number], "body" | "longitude">;
type BirthSky = { planets: readonly Planet[]; moonKnown: boolean };
const personal = new Set<string>(["Sun", "Moon", "Venus", "Mars", "Mercury"]);
const aspects = [0, 60, 90, 120, 180] as const;

/** Keep the chart owner on each side so the reading can name both planets. */
export function synastryConnections(self: BirthSky, partner: BirthSky) {
  const usable = (sky: BirthSky) => sky.planets.filter(
    planet => personal.has(planet.body) && (sky.moonKnown || planet.body !== "Moon"),
  );
  const connections = [];
  for (const mine of usable(self)) {
    for (const theirs of usable(partner)) {
      const distance = separation(mine.longitude, theirs.longitude);
      for (const angle of aspects) {
        const error = Math.abs(distance - angle);
        if (error <= 6) connections.push({ mine: mine.body, theirs: theirs.body, angle, error });
      }
    }
  }
  return connections.sort((a, b) => a.error - b.error);
}
