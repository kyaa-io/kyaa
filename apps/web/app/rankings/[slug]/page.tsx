import type { Metadata } from "next";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  return publicMetadata({ path: `/rankings/${slug}`, locale, title: `${rankingsText(locale, "rkFanTitle")} | kyaa`, description: rankingsText(locale, "rkFanTitle") });
}

/** 팬 랭킹은 팬페이지의 팬·랭킹 탭으로 옮겼다. 예전 주소는 그 탭으로 보낸다. */
export default async function FanRankingsPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  redirect(`/${encodeURIComponent(slug)}?tab=members&people=ranking&locale=${locale}` as Route);
}
