import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { askLoop, type AskCharacter, type AskContent } from "./lines";

const contents: AskContent[] = ["saju", "fortune", "star", "tarot"];
const characters: AskCharacter[] = ["changha", "elina", "yuna", "dosa"];

it("points every scene loop at an MP4 and WebM pair that ships with the app", () => {
  const loops = contents.flatMap(content => characters.map(character => askLoop(content, character))).filter((src): src is string => src !== null);
  expect(loops.length).toBeGreaterThan(0);
  for (const src of loops)
    for (const ext of [".mp4", ".webm"]) expect(existsSync(join(__dirname, "../../../public", src + ext)), src + ext).toBe(true);
});

it("moves every dosa scene and the creator scenes remade from the watercolor art", () => {
  expect(contents.map(content => askLoop(content, "dosa") !== null)).toEqual([true, true, true, true]);
  expect([askLoop("saju", "changha"), askLoop("star", "elina"), askLoop("tarot", "yuna"), askLoop("saju", "yuna")]).toEqual([
    "/chemi/video/chemi-ask-saju-changha-loop-v1", "/chemi/video/chemi-ask-star-elina-loop-v1", "/chemi/video/chemi-ask-tarot-yuna-loop-v1", null]);
});
