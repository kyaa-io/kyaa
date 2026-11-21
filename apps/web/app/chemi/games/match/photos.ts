import "server-only";
import { chemiEnabled } from "@/features/chemi/domain/availability";

type MatchPhotos = {
  portrait: string;
  scene: string;
  cards: readonly string[];
};

const root = "/images/celebrities";
const catalog = {
  changha: {
    portrait: `${root}/changha/portrait-20261021.webp`,
    scene: `${root}/changha/hero-editorial-20260911.webp`,
    cards: [
      "/chemi/match/c7.jpg",
      "/chemi/match/c3.jpg",
      "/chemi/match/c8.jpg",
      "/chemi/match/c1.jpg",
      "/chemi/match/c2.jpg",
      "/chemi/match/c6.jpg",
    ],
  },
  elina: {
    portrait: `${root}/elina/guide-autumn-20260921.jpg`,
    scene: `${root}/elina/hero-beach.jpg`,
    cards: [
      "/chemi/match/e1.jpg",
      `${root}/elina/hero-source.jpg`,
      `${root}/elina/hero-beach.jpg`,
      `${root}/elina/guide-autumn-20260921.jpg`,
    ],
  },
  yuna: {
    portrait: "/images/groups/source-calendar/f9c838570dbcfc33.jpg",
    scene: `${root}/yuna/hero-beach.jpg`,
    cards: [
      "/images/groups/source-calendar/f9c838570dbcfc33.jpg",
      `${root}/yuna/hero-beach.jpg`,
      "/api/content-assets/857c6367-6f97-40ff-ac11-b14cc2fb4e6e",
      "/images/calendar/yuna-portrait.jpg",
      "/chemi/match/y1.jpg",
    ],
  },
} as const satisfies Record<"changha" | "elina" | "yuna", MatchPhotos>;

export function getMatchPhotos() {
  return chemiEnabled() ? catalog : null;
}
