import "server-only";
import { GET as readLiveCatalog } from "@/app/api/live-events/route";
import { officialMediaRoute } from "@/server/media/official-media-route";

/** 팬페이지 홈 갤러리가 첫 화면에 쓰는 공개 읽기(공식 미디어, 이 크리에이터의 LIVE·다시보기)를 같은 핸들러로 인증 없이 읽는다.
 * 주소는 `CreatorMediaPanel`이 브라우저에서 읽는 주소와 글자까지 같아야 한다. 실패한 읽기는 빼고, 브라우저가 평소처럼 읽는다. */
export function creatorGallerySeedUrls(slug: string, contentLocale: string) {
  const creator = encodeURIComponent(slug);
  return { media: `/api/celebrities/${creator}/media?locale=${contentLocale}`, catalog: `/api/live-events?locale=${contentLocale}&creator=${creator}` };
}

async function body(response: Response): Promise<unknown> {
  if (!response.ok) return undefined;
  try { return await response.json(); } catch { return undefined; }
}

export async function loadCreatorGallerySeeds(slug: string, contentLocale: string): Promise<Record<string, unknown>> {
  const urls = creatorGallerySeedUrls(slug, contentLocale);
  const [media, catalog] = await Promise.all([
    officialMediaRoute(new Request(`http://localhost${urls.media}`), slug).then(body, () => undefined),
    readLiveCatalog(new Request(`http://localhost${urls.catalog}`)).then(body, () => undefined),
  ]);
  const seeds: Record<string, unknown> = {};
  if (media !== undefined) seeds[urls.media] = media;
  if (catalog !== undefined) seeds[urls.catalog] = catalog;
  return seeds;
}
