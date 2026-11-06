import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isCreatorHandle } from "@/features/creator/domain/creator-navigation";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { CreatorPageFrame } from "@/features/groups/ui/group-page-frame";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { loadSeoCreator } from "@/server/seo/public-content";

/** 모임 기능이 켜진 페이지의 머리·접속 띠·탭. wave와 기능이 꺼진 경로는 프레임 없이 옛 화면을 그린다. */
export default async function CreatorPageLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  if (!isCreatorHandle(slug)) notFound();
  if (slug === WAVE_FANPAGE_SLUG || process.env.KYAA_GROUPS_ENABLED !== "true") return children;
  const locale = parseAppLocale((await headers()).get("x-byus-locale"));
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  return <CreatorPageFrame slug={slug} celebrity={celebrity} celebrityLocale={toContentLocale(locale)}>{children}</CreatorPageFrame>;
}
