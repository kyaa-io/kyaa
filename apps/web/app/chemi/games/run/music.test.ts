import { describe, expect, it } from "vitest";
import { arrangement, chordOf, notesOf, renderLoop, SONGS } from "./music";
import { characters } from "./shared";

describe("run songs", () => {
  it("gives each 최애 a different running song of 30 to 60 seconds and a shorter result reprise", () => {
    const hooks = new Set<string>();
    for (const who of characters) {
      const run = renderLoop(who, "run", 8000);
      const seconds = run.samples.length / run.rate;
      expect(seconds).toBeGreaterThanOrEqual(30);
      expect(seconds).toBeLessThanOrEqual(60);
      const result = renderLoop(who, "result", 8000);
      expect(result.samples.length / result.rate).toBeLessThan(seconds);
      hooks.add(SONGS[who].hook.map(([, melody]) => melody).join("|"));
    }
    expect(hooks.size).toBe(characters.length);
    expect(new Set(characters.map((who) => SONGS[who].bpm)).size).toBe(characters.length);
  });

  it("brings the eight-bar hook back so the running song opens and closes on it", () => {
    for (const who of characters) {
      const { bars } = arrangement(who, "run");
      expect(bars.slice(0, 8)).toEqual(SONGS[who].hook);
      expect(bars.slice(-8)).toEqual(SONGS[who].hook);
      expect(SONGS[who].hook).toHaveLength(8);
    }
  });

  it("writes every bar as sixteen steps of known notes and chords", () => {
    for (const who of characters) {
      for (const [chord, melody] of [...SONGS[who].hook, ...SONGS[who].middle]) {
        expect(notesOf(melody).length).toBeGreaterThan(0);
        for (const part of chord.split("|")) expect(chordOf(part)).toHaveLength(3);
      }
    }
    expect(() => notesOf("C5 . .")).toThrow();
  });

  it("wraps ringing notes to the start so the loop has no seam and stays under the effects", () => {
    for (const who of characters) for (const scene of ["run", "result"] as const) {
      const { samples } = renderLoop(who, scene, 8000);
      let peak = 0;
      let jump = 0;
      for (let i = 1; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]));
        jump = Math.max(jump, Math.abs(samples[i] - samples[i - 1]));
      }
      expect(peak).toBeCloseTo(0.22, 5);
      // The step from the last sample back to the first is no larger than steps inside the song.
      expect(Math.abs(samples[0] - samples.at(-1)!)).toBeLessThanOrEqual(jump);
    }
  });
});
