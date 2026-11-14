/** 모임 맨 위 크리에이터 홍보 배너(대표·보석 2026-11-14 22:08). 그림 한 장이 한 칸이다. 이름은 그림 안 레터링이라 화면에는 글자를 따로 그리지 않고 `alt`에만 쓴다. */
export type CreatorPromoBanner = { slug: string; nameKo: string; nameEn: string; image: string };

const promo = (slug: string, nameKo: string, nameEn: string): CreatorPromoBanner => ({ slug, nameKo, nameEn, image: `/images/groups/promo/${slug}-20261114.webp` });

/** 활동이 없을 때의 고정 순서. */
export const creatorPromoBanners: readonly CreatorPromoBanner[] = [
  promo("changha", "창하", "Changha"),
  promo("elina", "엘리나", "Elina"),
  promo("yuna", "유나", "Yuna"),
  promo("hiroro", "히로로", "Hiroro"),
  promo("mmnoo-s", "민주", "Minju"),
  promo("nchive", "엔카이브", "NCHIVE"),
  promo("wena", "위나", "WENA"),
];

/** 이번 주 활동 순(`read_today_fanpages` 결과의 slug 순서)으로 배너 7장을 앞에 두고, 활동이 없는 크리에이터는 고정 순서로 뒤에 붙인다. 배너가 없는 slug는 버린다. */
export function orderCreatorPromoBanners(activeSlugs: readonly string[] = []): CreatorPromoBanner[] {
  const bySlug = new Map(creatorPromoBanners.map((banner) => [banner.slug, banner]));
  const ranked = [...new Set(activeSlugs)].flatMap((slug) => bySlug.get(slug) ?? []);
  return [...ranked, ...creatorPromoBanners.filter((banner) => !ranked.includes(banner))];
}
