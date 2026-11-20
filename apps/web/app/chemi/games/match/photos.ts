import "server-only";
import { chemiEnabled } from "@/features/chemi/domain/availability";

type MatchPhotos = {
  portrait: string;
  scene: string;
  cards: readonly [string, string, string, string];
};

const root = "/images/celebrities";
const catalog = {
  changha: {
    portrait: `${root}/changha/portrait-20261021.webp`,
    scene: `${root}/changha/hero-desktop-20261021.webp`,
    cards: [
      `${root}/changha/profile-autumn-20261113.webp`,
      `${root}/changha/hero-editorial-20260911.webp`,
      `${root}/changha/portrait-20261021.webp`,
      `${root}/changha/calendar-20261021.webp`,
    ],
  },
  elina: {
    portrait: `${root}/elina/guide-autumn-20260921.jpg`,
    scene: `${root}/elina/hero-beach.jpg`,
    cards: [
      `${root}/elina/guide-blue-beret-20260912.webp`,
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
    ],
  },
} as const satisfies Record<"changha" | "elina" | "yuna", MatchPhotos>;

export function getMatchPhotos() {
  return chemiEnabled() ? catalog : null;
}
