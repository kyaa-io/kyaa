import { z } from "zod";
import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanPostDetail } from "@/features/fan-posts/ui/fan-post-detail";
import { parseAppLocale } from "@/i18n/locales";
import { loadSeoCreator } from "@/server/seo/public-content";
import { CreatorGroupPostPage } from "@/features/groups/ui/creator-group-post-page";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string; postId: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug, postId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(postId).success) notFound();
  const locale = parseAppLocale(query.locale);
  if (process.env.KYAA_GROUPS_ENABLED === "true" && slug !== WAVE_FANPAGE_SLUG) {
    const celebrity = await loadSeoCreator(slug, locale);
    if (!celebrity) notFound();
    return <CreatorGroupPostPage celebrity={celebrity} postId={postId} locale={locale}/>;
  }
  return <FanAppFrame locale={locale} mainId="fan-post-main"><FanContentContainer as="main" id="fan-post-main" tabIndex={-1} style={{ paddingBlock: 32 }}><FanPostDetail expectedSlug={slug} postId={postId} locale={locale} /></FanContentContainer></FanAppFrame>;
}
