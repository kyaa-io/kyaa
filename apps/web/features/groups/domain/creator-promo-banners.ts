/** 모임 맨 위 크리에이터 홍보 배너(대표·보석 2026-11-14 22:08). 그림 한 장이 한 칸이다. 이름은 그림 안 레터링이라 화면에는 글자를 따로 그리지 않고 `alt`에만 쓴다. */
export type CreatorPromoBanner = { slug: string; nameKo: string; nameEn: string; image: string };

const promo = (slug: string, nameKo: string, nameEn: string): CreatorPromoBanner => ({ slug, nameKo, nameEn, image: `/images/groups/promo/${slug}-20261114.webp` });

/** 배너가 있는 크리에이터 7명. 활동 순위가 없을 때는 이 순서의 첫 장을 건다. */
export const creatorPromoBanners: readonly CreatorPromoBanner[] = [
  promo("changha", "창하", "Changha"),
  promo("elina", "엘리나", "Elina"),
  promo("yuna", "유나", "Yuna"),
  promo("hiroro", "히로로", "Hiroro"),
  promo("mmnoo-s", "민주", "Minju"),
  promo("nchive", "엔카이브", "NCHIVE"),
  promo("wena", "위나", "WENA"),
];

/** 활동 순(`read_today_fanpages` 결과의 slug 순서)으로 줄 세운 배너: 활동 순위에 있는 배너가 먼저, 그다음 나머지를 고정 순서로 잇는다. 같은 배너는 한 번만 나온다. */
function rankCreatorPromoBanners(activeSlugs: readonly string[]): readonly CreatorPromoBanner[] {
  const ranked = activeSlugs.flatMap((slug) => creatorPromoBanners.find((banner) => banner.slug === slug) ?? []);
  return [...new Set([...ranked, ...creatorPromoBanners])];
}

/** 모임 맨 위에 걸 배너 1장(대표 2026-11-14 22:56 "1개를 밀어주는 걸"): 이번 주 활동 순 1위 가운데 배너가 있는 첫 크리에이터. 없으면 고정 순서의 첫 장. */
export function pickCreatorPromoBanner(activeSlugs: readonly string[] = []): CreatorPromoBanner {
  return rankCreatorPromoBanners(activeSlugs)[0]!;
}

/** PC(1024 이상)에서 나란히 걸 두 번째 배너(FB-N24): 활동 순 바로 다음 장. 1위와 겹치지 않는다. */
export function pickNextCreatorPromoBanner(activeSlugs: readonly string[] = []): CreatorPromoBanner {
  return rankCreatorPromoBanners(activeSlugs)[1]!;
}
