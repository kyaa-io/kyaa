import "server-only";
import { chemiEnabled } from "@/features/chemi/domain/availability";

type MatchPhotos = {
  portrait: string;
  scene: string;
  /** 넓은 화면 로비의 세로로 긴 사진 칸에 쓰는 원본. 가로 사진의 세로 해상도가 모자랄 때만 둔다. */
  lobby?: string;
  cards: readonly string[];
};

const root = "/images/celebrities";
/** 짝 카드 사진(512 정사각). 출처 원장은 같은 폴더의 sources.csv. */
const cards = "/chemi/match/cards";
const catalog = {
  changha: {
    portrait: `${root}/changha/portrait-20261021.webp`,
    scene: `${root}/changha/hero-editorial-20260911.webp`,
    lobby: `${root}/changha/portrait-20261021.webp`,
    cards: [
      `${cards}/changha-01.webp`,
      `${cards}/changha-02.webp`,
      `${cards}/changha-03.webp`,
      `${cards}/changha-04.webp`,
      `${cards}/changha-05.webp`,
      `${cards}/changha-06.webp`,
    ],
  },
  elina: {
    portrait: `${root}/elina/guide-autumn-20260921.jpg`,
    scene: `${root}/elina/hero-beach.jpg`,
    cards: [
      `${cards}/elina-01.webp`,
      `${cards}/elina-02.webp`,
      `${cards}/elina-03.webp`,
      `${cards}/elina-04.webp`,
      `${cards}/elina-05.webp`,
      `${cards}/elina-06.webp`,
      `${cards}/elina-07.webp`,
      `${cards}/elina-08.webp`,
      `${cards}/elina-09.webp`,
    ],
  },
  yuna: {
    portrait: "/images/groups/source-calendar/f9c838570dbcfc33.jpg",
    scene: `${root}/yuna/hero-beach.jpg`,
    cards: [
      `${cards}/yuna-01.webp`,
      `${cards}/yuna-02.webp`,
      `${cards}/yuna-03.webp`,
      `${cards}/yuna-04.webp`,
      `${cards}/yuna-05.webp`,
      `${cards}/yuna-06.webp`,
      `${cards}/yuna-07.webp`,
    ],
  },
} as const satisfies Record<"changha" | "elina" | "yuna", MatchPhotos>;

export function getMatchPhotos() {
  return chemiEnabled() ? catalog : null;
}
