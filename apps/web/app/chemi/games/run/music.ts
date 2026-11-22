export type MusicScene = "run" | "result";

// Original eight-bar loops. One buffer wraps on the audio clock, including on slow frames.
export function composeLoop(context: AudioContext, scene: MusicScene) {
  const beat = scene === "run" ? 0.32 : 0.44;
  const rate = 22050;
  const buffer = context.createBuffer(1, Math.round(32 * beat * rate), rate);
  const samples = buffer.getChannelData(0);
  const roots = scene === "run" ? [50, 55, 52, 57, 50, 55, 57, 55] : [55, 52, 48, 50, 55, 52, 50, 55];
  const phrase = scene === "run" ? [12, 19, 16, 14, 19, 16, 7, 14] : [19, 16, 14, 12, 16, 19, 24, 19];
  function note(start: number, length: number, pitch: number, level: number) {
    const first = Math.round(start * beat * rate);
    const count = Math.round(length * beat * rate);
    const step = 2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) / rate;
    for (let i = 0; i < count && first + i < samples.length; i++) {
      const envelope = Math.min(1, i / 120, (count - i - 1) / 320) * Math.exp(-2 * i / count);
      samples[first + i] += level * envelope * (Math.sin(i * step) + 0.18 * Math.sin(2 * i * step));
    }
  }
  roots.forEach((root, bar) => {
    for (let b = 0; b < 4; b++) {
      note(bar * 4 + b, 0.85, root - (b % 2 ? 5 : 12), 0.075);
      note(bar * 4 + b, 0.94, root + phrase[(bar * 4 + b) % phrase.length], 0.085);
      if (scene === "run" && b % 2) note(bar * 4 + b + 0.5, 0.42, root + 7, 0.035);
    }
  });
  return buffer;
}
