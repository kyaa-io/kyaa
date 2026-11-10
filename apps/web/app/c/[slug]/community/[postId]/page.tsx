import { z } from "zod";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanPostDetail } from "@/features/fan-posts/ui/fan-post-detail";
import { parseAppLocale, toContentLocale, type AppLocale } from "@/i18n/locales";
import { postSlotTexts } from "@/features/fan-posts/domain/post-title-slots";
import { postSchema } from "@/features/fan-posts/domain/content";
import { publicMetadata, shareOrigin } from "@/seo/metadata";
import { createContentDependencies } from "@/server/fan-posts/dependencies";
import { createContentHandlers } from "@/server/fan-posts/routes";
import { loadSeoCreator } from "@/server/seo/public-content";
import { CreatorGroupPostPage } from "@/features/groups/ui/creator-group-post-page";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; postId: string }>; searchParams: Promise<{ locale?: string }> };

/** The same anonymous read `GET /api/posts/:id` does without an Authorization header, so a members-only, hidden, deleted or proof post is `null` here too. */
async function readPublicPost(postId: string, slug: string, locale: AppLocale) {
  try {
    const response = await createContentHandlers(createContentDependencies()).post(new Request(`http://localhost/api/posts/${postId}?locale=${toContentLocale(locale)}`), postId);
    if (!response.ok) return null;
    const { post } = z.object({ post: postSchema }).parse(await response.json());
    return post.visibility === "public" && post.celebritySlug === slug ? post : null;
  } catch { return null; }
}
const oneLine = (text: string, max: number) => { const chars = Array.from(text.replace(/\s+/g, " ").trim()); return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join(""); };

/** The link preview of a public post is the post itself: its first line, the start of the rest, its first photo (else the creator's picture). Any other post keeps the site-wide preview. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, postId }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  if (slug === WAVE_FANPAGE_SLUG || !z.uuid().safeParse(postId).success) return {};
  const post = await readPublicPost(postId, slug, locale);
  if (!post) return {};
  const creator = await loadSeoCreator(slug, locale).catch(() => null);
  const [rawTitle, rawArticle] = postSlotTexts(post.body);
  const title = oneLine(rawTitle || rawArticle, 70) || creator?.name;
  if (!title) return {};
  const metadata = publicMetadata({ path: `/c/${slug}/community/${post.id}`, locale, title, description: oneLine(rawArticle, 120) || title, image: creator?.image.url, imageAlt: title });
  const first = post.assets[0];
  if (!first) return metadata;
  const images = [{ url: `${shareOrigin()}/api/content-assets/${first.id}`, width: first.width, height: first.height, alt: title }];
  return { ...metadata, openGraph: { ...metadata.openGraph, images }, twitter: { ...metadata.twitter, card: "summary_large_image", images } };
}
export default async function Page({ params, searchParams }: Props) {
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
