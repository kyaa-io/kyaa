import { composeLoop, type MusicScene } from "./music";
import type { RunEvent } from "@/features/chemi/games/run";

/** Effects are synthesised, so the game ships no audio files. One switch turns all of them on or off. */
type Tone = readonly [from: number, to: number, seconds: number, shape: OscillatorType, gain?: number];
const TONES: Partial<Record<RunEvent["type"] | "start" | "over", readonly Tone[]>> = {
  start: [[440, 660, 0.12, "square"]],
  jump: [[420, 720, 0.1, "square"]],
  double: [[620, 980, 0.1, "square"]],
  slide: [[300, 160, 0.12, "triangle"]],
  note: [[990, 1320, 0.06, "square", 0.03]],
  dodge: [[660, 880, 0.05, "triangle", 0.03]],
  combo: [[660, 990, 0.08, "square"], [990, 1320, 0.1, "square"]],
  hit: [[220, 70, 0.22, "sawtooth", 0.06]],
  block: [[520, 260, 0.14, "triangle"]],
  smash: [[180, 90, 0.1, "sawtooth"]],
  fever: [[523, 784, 0.1, "square"], [784, 1047, 0.1, "square"], [1047, 1568, 0.16, "square"]],
  heart: [[660, 1320, 0.16, "triangle"]],
  shield: [[440, 880, 0.16, "triangle"]],
  boost: [[330, 1320, 0.22, "sawtooth"]],
  fall: [[400, 60, 0.4, "sawtooth", 0.06]],
  over: [[392, 196, 0.3, "triangle"]],
};

export function createSound() {
  let context: AudioContext | undefined;
  let on = false;
  let scene: MusicScene | null = null;
  let source: AudioBufferSourceNode | undefined;
  let master: GainNode | undefined;
  const loops = new Map<MusicScene, AudioBuffer>();
  function unlock() {
    try {
      context ??= new AudioContext();
      if (!master) {
        master = context.createGain();
        master.gain.value = on ? 1 : 0;
        master.connect(context.destination);
      }
      void context.resume().catch(() => {});
    } catch { /* Audio output is optional. */ }
  }
  function syncMusic() {
    source?.stop();
    source?.disconnect();
    source = undefined;
    if (!context || !master || !scene || !on || document.hidden) return;
    const loop = loops.get(scene) ?? composeLoop(context, scene);
    loops.set(scene, loop);
    source = context.createBufferSource();
    source.buffer = loop;
    source.loop = true;
    source.connect(master);
    source.start();
  }
  function play(name: keyof typeof TONES) {
    const tones = TONES[name];
    if (!on || !tones) return;
    try {
      if (!context || !master) return;
      let at = context.currentTime;
      for (const [from, to, seconds, shape, level = 0.04] of tones) {
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.type = shape;
        tone.frequency.setValueAtTime(from, at);
        tone.frequency.exponentialRampToValueAtTime(to, at + seconds);
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
        tone.connect(gain).connect(master);
        tone.start(at);
        tone.stop(at + seconds + 0.02);
        at += seconds;
      }
    } catch {
      /* Audio can be unavailable on devices with restricted playback. */
    }
  }
  return {
    play,
    unlock,
    music(next: MusicScene | null) { if (scene !== next) { scene = next; syncMusic(); } },
    visibility: syncMusic,
    set(next: boolean) {
      if (on === next) return;
      on = next;
      if (master) master.gain.value = on ? 1 : 0;
      syncMusic();
    },
    close() { scene = null; syncMusic(); void context?.close().catch(() => {}); context = undefined; master = undefined; loops.clear(); },
  };
}
export type RunSound = ReturnType<typeof createSound>;
