import { PLAYER, RUN_INPUT, runRound, type RunEntity, type RunInput } from "./run";

const GROUND = ["cone", "barricade", "crates", "pit"];
const LOW = ["bar", "lantern"];

/**
 * Plays by the rules a person is shown: jump low things, double-jump tall things and pits,
 * slide under bars. Used to prove each course can be cleared before it ships.
 */
export function play(seed: number, limit: number, sim = runRound(seed), trace?: (line: string) => void) {
  const inputs: RunInput[] = [];
  let sliding = false;
  while (!sim.state.done && sim.state.tick < limit) {
    const s = sim.state;
    const left = s.distance + PLAYER.left;
    const right = s.distance + PLAYER.right;
    const ahead = sim.entities.filter((e) => !e.gone && e.x + e.w > left && (GROUND.includes(e.kind) || LOW.includes(e.kind)));
    const next: RunEntity | undefined = ahead[0];
    const time = next ? (next.x - right) / s.speed : 9;
    const low = Boolean(next && LOW.includes(next.kind));
    let mask = 0;
    if (s.grounded) {
      if (low && !sliding && time < 0.25) { mask |= RUN_INPUT.slideDown; sliding = true; }
      else if (sliding && !low) { mask |= RUN_INPUT.slideUp; sliding = false; }
      if (next && !low && (next.kind === "pit" ? next.x - right < 10 : time < (next.kind === "crates" ? 0.3 : 0.11))) mask |= RUN_INPUT.jump;
    } else {
      // Where this flight comes down if nothing else is pressed.
      const fall = (s.velocity + Math.sqrt(s.velocity * s.velocity + 1900 * Math.max(0, s.height))) / 950;
      const land = s.speed * fall;
      const blocked = ahead.some((e) => GROUND.includes(e.kind) && e.x < right + land + 6 && e.x + e.w > left + land - 6);
      const tall = ahead.some((e) => e.kind === "crates" && e.x < right + land);
      const under = ahead.some((e) => GROUND.includes(e.kind) && e.x < right + s.speed * 0.3);
      if (s.airJumps === 0 && s.velocity < 60 && s.height > 0 && (blocked || tall)) mask |= RUN_INPUT.jump;
      else if (s.velocity < 0 && !under && !sliding && s.height > 12) { mask |= RUN_INPUT.slideDown; sliding = true; }
    }
    if (mask) inputs.push([s.tick + 1, mask]);
    const hearts = s.hearts;
    sim.step(mask);
    if (trace && (mask || s.hearts < hearts || s.fell)) trace(`${s.tick} m${mask} h${s.height.toFixed(0)} v${s.velocity.toFixed(0)} sp${s.speed.toFixed(0)} hearts${s.hearts} | ` +
      ahead.slice(0, 3).map((e) => `${e.kind}@${(e.x - right).toFixed(0)}`).join(" "));
  }
  return { sim, inputs };
}
