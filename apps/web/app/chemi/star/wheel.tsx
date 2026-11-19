import { bodyNames, signNames, zodiacSigns } from "./copy";
import { natalAspects } from "./astro";
import type { StarPlanet } from "./reading";
import styles from "./wheel.module.css";

const center = 100;
const rim = 98;
const bandInner = 72;
const labelRadius = 85;
const planetRadius = 54;
const lineRadius = 46;
/** 양자리 0도가 왼쪽에서 시작해 시계 방향으로 간다(승인 시안 05-3). */
const point = (longitude: number, radius: number) => {
  const theta = Math.PI + (longitude * Math.PI) / 180;
  return [center + radius * Math.cos(theta), center + radius * Math.sin(theta)] as const;
};

/** 가까운 행성은 안쪽으로 한 칸씩 밀어 겹침을 피한다. */
function spread(planets: StarPlanet[]) {
  const order = [...planets].sort((a, b) => a.longitude - b.longitude);
  const rings: Record<string, number> = {};
  let previous = -99;
  let step = 0;
  for (const planet of order) {
    step = planet.longitude - previous < 9 ? step + 1 : 0;
    rings[planet.body] = planetRadius - (step % 3) * 11;
    previous = planet.longitude;
  }
  return rings;
}

export function ChartWheel({ planets }: { planets: StarPlanet[] }) {
  const rings = spread(planets);
  const lines = natalAspects(
    planets.filter((planet) => planet.body !== "Uranus" && planet.body !== "Neptune" && planet.body !== "Pluto"),
  ).slice(0, 5);
  const longitudes = Object.fromEntries(planets.map((p) => [p.body, p.longitude]));
  return (
    <svg
      className={styles.wheel}
      viewBox="0 0 200 200"
      role="img"
      aria-label={`내 출생 차트 원판. ${planets
        .map((p) => `${bodyNames[p.body]} ${signNames[p.sign].full}`)
        .join(", ")}`}
    >
      <circle className={styles.rim} cx={center} cy={center} r={rim} />
      <circle className={styles.inner} cx={center} cy={center} r={bandInner} />
      {zodiacSigns.map((sign, index) => {
        const [x1, y1] = point(index * 30, bandInner);
        const [x2, y2] = point(index * 30, rim);
        const [lx, ly] = point(index * 30 + 15, labelRadius);
        return (
          <g key={sign}>
            <line className={styles.spoke} x1={x1} y1={y1} x2={x2} y2={y2} />
            <text className={styles.sign} fontSize={12} fontWeight={700} x={lx} y={ly} textAnchor="middle" dominantBaseline="central">
              {signNames[sign].short}
            </text>
          </g>
        );
      })}
      {lines.map((line) => {
        const [x1, y1] = point(longitudes[line.a]!, lineRadius);
        const [x2, y2] = point(longitudes[line.b]!, lineRadius);
        return (
          <line
            key={`${line.a}${line.b}${line.angle}`}
            className={styles.aspect}
            data-hard={line.angle === 90 || line.angle === 180 || undefined}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          />
        );
      })}
      {planets.map((planet) => {
        const [x, y] = point(planet.longitude, rings[planet.body]!);
        const lead = planet.body === "Sun" || planet.body === "Moon";
        return (
          <circle
            key={planet.body}
            className={styles.dot}
            data-lead={lead || undefined}
            cx={x}
            cy={y}
            r={lead ? 5 : 3.5}
          >
            <title>{`${bodyNames[planet.body]} · ${signNames[planet.sign].full}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
