import type { Character } from "./shared";

export type MusicScene = "run" | "result";

/**
 * Each 최애 has a chiptune song written for this game: a hook of eight bars, a middle of eight and
 * the hook again, so the catchy part comes back every half minute. The result screen replays the
 * same hook slower and lighter. Everything is synthesised here: no audio files, no samples.
 *
 * Bars are 16 steps of a sixteenth note. In a melody a note name starts a note, "-" holds it and
 * "." is a rest. "Bb|C" splits the bar between two chords.
 */
type Bar = readonly [chord: string, melody: string];
type Song = {
  bpm: number;
  /** Lead pulse width: thin is bright and bouncy, half is round and soft. */
  duty: number;
  vibrato: number;
  /** How the lead is played: staccato notes are cut to part of their length. */
  staccato: number;
  bass: "bounce" | "walk" | "drive";
  drums: "skip" | "soft" | "four";
  hook: readonly Bar[];
  middle: readonly Bar[];
};

/** 창하: 장난스럽게 — fast, thin bright pulse, staccato hops and an octave-bouncing bass. */
const CHANGHA: Song = {
  bpm: 152, duty: 0.125, vibrato: 0, staccato: 0.55, bass: "bounce", drums: "skip",
  hook: [
    ["F", "C6 . A5 . C6 . A5 . F5 G5 A5 . C6 . . ."],
    ["C", "D6 . C6 . A#5 . A5 . G5 . . . E5 . G5 ."],
    ["Dm", "D6 . A5 . D6 . A5 . F5 G5 A5 . D6 . . ."],
    ["Bb", "F6 . E6 . D6 . C6 . D6 . . . A#5 . . ."],
    ["F", "C6 . A5 . C6 . A5 . F5 G5 A5 . C6 . . ."],
    ["C", "E6 . D6 . C6 . A#5 . C6 . E6 . G6 . . ."],
    ["Bb|C", "F6 . D6 . A#5 . D6 . E6 . C6 . G5 . E6 ."],
    ["F", "F6 . . . C6 . A5 . F5 . . . A5 . . ."],
  ],
  middle: [
    ["Bb", "D5 . F5 . . . D6 . . . . . A#5 . . ."],
    ["C", "E5 . G5 . . . E6 . . . . . C6 . . ."],
    ["Am", "C5 . E5 . . . C6 . . . . . A5 . . ."],
    ["Dm", "D5 . F5 . A5 . D6 . C6 . A5 . F5 . . ."],
    ["Gm", "D5 . G5 . . . D6 . . . . . A#5 . . ."],
    ["C", "E5 . G5 . . . E6 . . . . . G6 . . ."],
    ["Bb", "F6 - - - D6 - - - A#5 - - - F5 - - -"],
    ["C", "G5 . A5 . A#5 . B5 . C6 . . . E6 . G6 ."],
  ],
};

/** 엘리나: 다정하게 — calmer, round half pulse with vibrato, long tied notes and a walking bass. */
const ELINA: Song = {
  bpm: 128, duty: 0.5, vibrato: 0.007, staccato: 0.96, bass: "walk", drums: "soft",
  hook: [
    ["D", "F#5 - - - A5 - - - D6 - - - C#6 - B5 -"],
    ["Bm", "B5 - - - - - - - A5 - F#5 - - - D5 -"],
    ["G", "G5 - - - B5 - - - D6 - - - E6 - D6 -"],
    ["A", "C#6 - - - - - - - A5 - - - . . . ."],
    ["D", "F#5 - - - A5 - - - D6 - - - F#6 - E6 -"],
    ["F#m", "C#6 - - - - - A5 - F#5 - - - A5 - - -"],
    ["G", "B5 - - - D6 - B5 - G5 - - - B5 - D6 -"],
    ["A", "E6 - - - - - - - - - - - . . A5 -"],
  ],
  middle: [
    ["Bm", "D6 - C#6 - B5 - - - F#5 - - - - - - -"],
    ["G", "G5 - A5 - B5 - - - D6 - - - B5 - - -"],
    ["D", "A5 - - - F#5 - - - D5 - - - F#5 - A5 -"],
    ["A", "E5 - - - - - - - C#5 - - - E5 - - -"],
    ["Bm", "D6 - C#6 - B5 - - - F#6 - - - E6 - D6 -"],
    ["G", "D6 - - - B5 - - - G5 - - - B5 - D6 -"],
    ["Em", "E6 - - - G6 - - - F#6 - - - E6 - - -"],
    ["A", "C#6 - - - - - - - E6 - - - A5 - - -"],
  ],
};

/** 유나: 솔직하게 — straight minor riff said twice, quarter pulse, pumping eighth bass and four-on-the-floor. */
const YUNA: Song = {
  bpm: 144, duty: 0.25, vibrato: 0, staccato: 0.8, bass: "drive", drums: "four",
  hook: [
    ["Am", "A5 . A5 . C6 . A5 . E6 . . . D6 . C6 ."],
    ["F", "A5 . A5 . C6 . A5 . F6 . . . E6 . C6 ."],
    ["C", "G5 . G5 . C6 . G5 . E6 . . . D6 . C6 ."],
    ["G", "B5 . . . D6 . . . G6 . . . D6 . B5 ."],
    ["Am", "A5 . A5 . C6 . A5 . E6 . . . D6 . C6 ."],
    ["F", "A5 . A5 . C6 . A5 . F6 . . . A6 . F6 ."],
    ["C", "G6 . E6 . C6 . E6 . G6 . . . E6 . C6 ."],
    ["E", "B5 . . . G#5 . . . E5 . . . G#5 . B5 ."],
  ],
  middle: [
    ["F", "C6 - - - A5 - - - F5 - - - A5 - C6 -"],
    ["G", "D6 - - - B5 - - - G5 - - - B5 - D6 -"],
    ["Em", "E6 - - - - - - - G6 - - - E6 - - -"],
    ["Am", "A6 - - - - - - - E6 - C6 - A5 - - -"],
    ["F", "C6 . C6 . A5 . C6 . F6 . . . C6 . . ."],
    ["G", "D6 . D6 . B5 . D6 . G6 . . . D6 . . ."],
    ["E", "E6 . . . G#6 . . . B6 . . . G#6 . . ."],
    ["E", "E6 . D6 . B5 . G#5 . E5 . . . . . . ."],
  ],
};

export const SONGS: Record<Character, Song> = { changha: CHANGHA, elina: ELINA, yuna: YUNA };
/** The result reprise is the hook alone at this share of the running tempo. */
const RESULT_TEMPO = 0.85;
const RATE = 22050;
/** Loudest sample after mixing; the effects keep room above it. */
const PEAK = 0.22;

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchOf(name: string) {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw Error(`MUSIC_NOTE ${name}`);
  return 12 * (Number(match[3]) + 1) + NAMES[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
}
/** Chord name to its notes from the root at octave 3 (MIDI 48 = C3). */
export function chordOf(name: string) {
  const match = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (!match) throw Error(`MUSIC_CHORD ${name}`);
  const root = 48 + NAMES[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  return [root, root + (match[3] ? 3 : 4), root + 7];
}
/** Melody text to notes in sixteenth steps. */
export function notesOf(melody: string) {
  const steps = melody.trim().split(/\s+/);
  if (steps.length !== 16) throw Error(`MUSIC_BAR ${melody}`);
  const notes: { step: number; length: number; pitch: number }[] = [];
  steps.forEach((token, step) => {
    if (token === "-") { if (notes.length && notes.at(-1)!.step + notes.at(-1)!.length === step) notes.at(-1)!.length++; }
    else if (token !== ".") notes.push({ step, length: 1, pitch: pitchOf(token) });
  });
  return notes;
}

function hz(pitch: number) {
  return 440 * 2 ** ((pitch - 69) / 12);
}
/** Band-limited step correction so thin pulses stay clean instead of fizzing. */
function blep(t: number, dt: number) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

export function arrangement(who: Character, scene: MusicScene) {
  const song = SONGS[who];
  const bars = scene === "run" ? [...song.hook, ...song.middle, ...song.hook] : song.hook;
  const bpm = scene === "run" ? song.bpm : song.bpm * RESULT_TEMPO;
  return { song, bars, step: 60 / bpm / 4 };
}

/**
 * Renders one loop. Notes that ring past the end wrap to the start, so the buffer repeats with no
 * seam when AudioBufferSourceNode.loop plays it.
 */
export function renderLoop(who: Character, scene: MusicScene, rate = RATE) {
  const { song, bars, step } = arrangement(who, scene);
  const length = Math.round(bars.length * 16 * step * rate);
  const out = new Float32Array(length);
  const light = scene === "result";
  let noise = 0x2f6b;

  function voice(start: number, seconds: number, pitch: number, level: number, shape: "pulse" | "triangle" | "kick" | "noise", duty = 0.5, vibrato = 0) {
    const first = Math.round(start * rate);
    const count = Math.round(seconds * rate);
    const release = Math.min(count, Math.round(0.012 * rate));
    let phase = 0;
    for (let i = 0; i < count + release; i++) {
      const t = i / rate;
      const gate = i < count ? 1 : 1 - (i - count) / release;
      const attack = Math.min(1, i / (0.003 * rate));
      let sample = 0;
      if (shape === "noise") {
        // 15-bit shift register like the old consoles' noise channel.
        if (i % 2 === 0) noise = (noise >> 1) | (((noise ^ (noise >> 1)) & 1) << 14);
        sample = (noise & 1 ? 1 : -1) * Math.exp(-t / (seconds * 0.35));
      } else if (shape === "kick") {
        phase += (45 + 110 * Math.exp(-t / 0.03)) / rate;
        sample = Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.09);
      } else {
        const wobble = vibrato && t > 0.14 ? 1 + vibrato * Math.sin(2 * Math.PI * 5.5 * t) : 1;
        const dt = hz(pitch) * wobble / rate;
        phase = (phase + dt) % 1;
        if (shape === "triangle") sample = 4 * Math.abs(phase - 0.5) - 1;
        else {
          sample = (phase < duty ? 1 : -1) + blep(phase, dt) - blep((phase - duty + 1) % 1, dt);
          sample -= 2 * duty - 1;
          sample *= 0.85 + 0.15 * Math.exp(-t / 0.25);
        }
      }
      out[(first + i) % length] += level * sample * gate * attack;
    }
  }

  bars.forEach(([chord, melody], bar) => {
    const at = bar * 16 * step;
    const halves = chord.split("|").map(chordOf);
    const chordAt = (s: number) => halves[s < 8 ? 0 : halves.length - 1];
    for (const note of notesOf(melody)) {
      voice(at + note.step * step, note.length * step * song.staccato, note.pitch, light ? 0.3 : 0.34, "pulse", song.duty, song.vibrato);
    }
    // Chord colour: a quiet broken chord an octave up, the classic way one channel plays harmony.
    for (let s = 0; s < 16; s += light ? 2 : 1) {
      const [root, third, fifth] = chordAt(s);
      voice(at + s * step, step * 0.7, [root, third, fifth, third][s % 4] + 12, light ? 0.07 : 0.09, "pulse", 0.25);
    }
    for (let s = 0; s < 16; s += 2) {
      const [root, , fifth] = chordAt(s);
      const low = root - 12;
      const pitch = song.bass === "bounce" ? low + (s % 4 ? 12 : 0)
        : song.bass === "walk" ? [low, low, low + 7, low + 7, low + 12, low + 12, low + 7, fifth - 12][s / 2]
          : low;
      const hold = song.bass === "walk" ? 1.9 : song.bass === "bounce" ? 0.9 : 1.6;
      voice(at + s * step, step * hold, pitch, 0.42, "triangle");
    }
    const kicks = song.drums === "four" ? [0, 4, 8, 12] : song.drums === "skip" ? [0, 6, 8] : [0, 8];
    for (const s of light ? [0, 8] : kicks) voice(at + s * step, 0.12, 0, song.drums === "soft" ? 0.35 : 0.5, "kick");
    for (const s of [4, 12]) voice(at + s * step, 0.14, 0, song.drums === "soft" ? 0.08 : 0.16, "noise");
    const hats = song.drums === "four" ? [2, 6, 10, 14] : [0, 2, 4, 6, 8, 10, 12, 14];
    if (!light) for (const s of hats) voice(at + s * step, song.drums === "four" ? 0.07 : 0.03, 0, song.drums === "soft" ? 0.025 : 0.05, "noise");
  });

  let loudest = 0;
  for (const value of out) loudest = Math.max(loudest, Math.abs(value));
  if (loudest > 0) for (let i = 0; i < length; i++) out[i] *= PEAK / loudest;
  return { samples: out, rate };
}

export function composeLoop(context: BaseAudioContext, who: Character, scene: MusicScene) {
  const { samples, rate } = renderLoop(who, scene);
  const buffer = context.createBuffer(1, samples.length, rate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
