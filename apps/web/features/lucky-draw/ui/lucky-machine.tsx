import styles from "./lucky-draw-module.module.css";

/** kyaa's own capsule machine (line art, 5차 1단계 = still frame): dome with five capsules, body, outlet and six lights.
 * `closed` drops one capsule in the outlet. The groups carry `data-capsule`·`data-light` so the idle loop (2단계) can move them with transform·opacity only. */
export function LuckyMachine({ closed = false }: { closed?: boolean }) {
  const capsules: Array<[number, number, number]> = [[76, 86, -12], [104, 92, 8], [128, 78, 20], [90, 62, -4], [116, 58, 14]];
  const lights = [62, 77, 92, 108, 123, 138];
  return <svg className={styles.machine} viewBox="0 0 200 200" role="presentation" aria-hidden="true" focusable="false" data-art="lucky-machine">
    <g className={styles.machineGroup} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={100} cy={76} r={52} className={styles.dome} />
      <path d="M62 112 h76" />
      {capsules.slice(0, closed ? 4 : 5).map(([x, y, r], index) => <g key={index} data-capsule={index} transform={`rotate(${r} ${x} ${y})`}>
        <circle cx={x} cy={y} r={11} className={styles.capsule} />
        <path d={`M${x - 11} ${y} h22`} />
        <path d={`M${x - 11} ${y} a11 11 0 0 0 22 0`} className={styles.capsuleHalf} />
      </g>)}
      <path d="M58 124 h84 l8 56 h-100 z" className={styles.body} />
      <rect x={86} y={150} width={28} height={18} rx={4} />
      {closed ? <g data-capsule="out"><circle cx={100} cy={162} r={6} className={styles.capsule} /><path d="M94 162 a6 6 0 0 0 12 0" className={styles.capsuleHalf} /></g> : null}
      <circle cx={128} cy={140} r={6} />
      <path d="M128 136 v8" />
      {lights.map((x, index) => <circle key={x} cx={x} cy={186} r={2} data-light={index} className={styles.light} />)}
    </g>
  </svg>;
}
