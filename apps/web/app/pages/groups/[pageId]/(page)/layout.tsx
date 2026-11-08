import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { isCreatorHandle } from "@/features/creator/domain/creator-navigation";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { GroupPageFrame } from "@/features/groups/ui/group-page-frame";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { loadPublicGroupDetail, loadPublicGroupHasArtists, loadPublicGroupPostsEmpty } from "@/server/groups/public-detail";
import { loadSeoCreator } from "@/server/seo/public-content";

/** 머리·접속 띠·탭은 여기서 한 번만 마운트된다. 탭(`?tab=`)을 바꿔도 다시 그려지지 않는다.
 * 비로그인 독자가 받는 공개 상세로 머리를 서버에서 바로 그리고, 브라우저가 로그인을 확인한 뒤 그 사람의 상세로 바꾼다. */
export default async function GroupPageLayout({ params, children }: { params: Promise<{ pageId: string }>; children: ReactNode }) {
  if (!groupsEnabled()) notFound();
  const { pageId } = await params;
  if (!z.string().uuid().safeParse(pageId).success) notFound();
  const locale = parseAppLocale((await headers()).get("x-byus-locale"));
  const [detail, publicPostsEmpty, artistTag] = await Promise.all([loadPublicGroupDetail(pageId, locale), loadPublicGroupPostsEmpty(pageId), loadPublicGroupHasArtists(pageId)]);
  const page = detail?.page;
  const linkedSlug = page?.kind === "fan" && page.celebrityId && page.slug && isCreatorHandle(page.slug) ? page.slug : null;
  const creator = linkedSlug ? await loadSeoCreator(linkedSlug, locale).catch(() => null) : null;
  const celebrity = creator && creator.slug === linkedSlug && !creator.roles.includes("brand") ? creator : undefined;
  // 로그인한 브라우저(Privy 세션 쿠키)면 회원 메뉴가 들어올 자리를 먼저 비워 두어, 이 사람의 상세가 도착할 때 제목 줄이 다시 접히지 않게 한다.
  const signedIn = (await cookies()).has("privy-session");
  return <GroupPageFrame pageId={pageId} initialDetail={detail ?? undefined} reserveMenu={signedIn} publicPostsEmpty={publicPostsEmpty} artistTag={artistTag} celebrity={celebrity} celebrityLocale={celebrity ? toContentLocale(locale) : undefined}>{children}</GroupPageFrame>;
}
