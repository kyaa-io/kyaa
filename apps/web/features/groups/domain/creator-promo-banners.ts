/** 모임 맨 위 크리에이터 홍보 배너(대표·보석 2026-11-14 22:08). 고정 순서, 그림 한 장이 한 칸이다. 이름은 그림 안 레터링이라 화면에는 글자를 따로 그리지 않고 `alt`에만 쓴다. */
export type CreatorPromoBanner = { slug: string; nameKo: string; nameEn: string; image: string };

const promo = (slug: string, nameKo: string, nameEn: string): CreatorPromoBanner => ({ slug, nameKo, nameEn, image: `/images/groups/promo/${slug}-20261114.webp` });

export const creatorPromoBanners: readonly CreatorPromoBanner[] = [
  promo("changha", "창하", "Changha"),
  promo("elina", "엘리나", "Elina"),
  promo("yuna", "유나", "Yuna"),
  promo("hiroro", "히로로", "Hiroro"),
  promo("mmnoo-s", "민주", "Minju"),
  promo("nchive", "엔카이브", "NCHIVE"),
  promo("wena", "위나", "WENA"),
];
