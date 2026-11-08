import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isCreatorHandle } from "@/features/creator/domain/creator-navigation";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { CreatorPageFrame } from "@/features/groups/ui/group-page-frame";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { loadPublicGroupDetailBySlug, loadPublicGroupHasArtists, loadPublicGroupPostsEmpty } from "@/server/groups/public-detail";
import { loadSeoCreator } from "@/server/seo/public-content";

/** 모임 기능이 켜진 페이지의 머리·접속 띠·탭. wave와 기능이 꺼진 경로는 프레임 없이 옛 화면을 그린다. */
export default async function CreatorPageLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  if (!isCreatorHandle(slug)) notFound();
  if (slug === WAVE_FANPAGE_SLUG || process.env.KYAA_GROUPS_ENABLED !== "true") return children;
  const locale = parseAppLocale((await headers()).get("x-byus-locale"));
  const [celebrity, detail] = await Promise.all([loadSeoCreator(slug, locale), loadPublicGroupDetailBySlug(slug, locale)]);
  if (!celebrity) notFound();
  // 비로그인 독자가 받는 공개 상세로 갤러리·머리를 서버 HTML에 그린다. 브라우저는 로그인 확인 뒤 그 사람의 상세로 바꾼다.
  const [publicPostsEmpty, artistTag] = detail ? await Promise.all([loadPublicGroupPostsEmpty(detail.page.id), loadPublicGroupHasArtists(detail.page.id)]) : [false, false];
  const signedIn = (await cookies()).has("privy-session");
  return <CreatorPageFrame slug={slug} celebrity={celebrity} celebrityLocale={toContentLocale(locale)} initialDetail={detail ?? undefined} reserveMenu={signedIn} publicPostsEmpty={publicPostsEmpty} artistTag={artistTag}>{children}</CreatorPageFrame>;
}
