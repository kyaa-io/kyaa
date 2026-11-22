import { expect, it } from "vitest";
import { composeLoop } from "./music";

it("renders distinct play and result phrases that meet at silence on the loop boundary", () => {
  const createBuffer = (_channels: number, length: number, sampleRate: number) => {
    const samples = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => samples };
  };
  const context = { createBuffer } as unknown as AudioContext;
  for (const [scene, seconds] of [["run", 10.24], ["result", 14.08]] as const) {
    const buffer = composeLoop(context, scene);
    const samples = buffer.getChannelData(0);
    expect(buffer.duration).toBeCloseTo(seconds);
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(0);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
  }
});
