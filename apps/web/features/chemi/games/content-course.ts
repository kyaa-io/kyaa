import { FPS } from "./engine";

/** Chapter order and source offsets from the Andong editing guide. */
export const ANDONG_COURSE = {
  id: "andong",
  videoId: "JHh74aQCwaQ",
  seed: 1125,
  sections: [
    { id: "yangpyeong", sourceSeconds: 341, endTick: 30 * FPS },
    { id: "festival", sourceSeconds: 505, endTick: 60 * FPS },
    { id: "hotel", sourceSeconds: 565, endTick: 90 * FPS },
    { id: "hahoe", sourceSeconds: 684, endTick: 120 * FPS },
    { id: "wolyeonggyo", sourceSeconds: 909, endTick: 150 * FPS },
  ],
} as const;
