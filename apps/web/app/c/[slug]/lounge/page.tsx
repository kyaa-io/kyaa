import { redirectTo } from "@/lib/navigation/untyped";
import { parseAppLocale } from "@/i18n/locales";
import { boardHref } from "@/features/fanpage/domain/board-navigation";
import { notFound } from "next/navigation";
import { loadSeoCreator } from "@/server/seo/public-content";
export const dynamic = "force-dynamic";
export const metadata = { title: "팬 라운지 | kyaa", robots: { index: false, follow: true } };
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  redirectTo(boardHref(celebrity.slug, locale, { source: "fans" }));
}
