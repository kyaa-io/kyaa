import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { NO_INDEX } from "@/seo/metadata";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { resolveInviteShortLink } from "@/server/community-stamps/invite-short-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation | kyaa", robots: NO_INDEX, referrer: "no-referrer" };

// 261107-2 E3: kyaa.io/i/<7 letters> opens the same invite landing as the long address.
export default async function InviteShortLinkPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const single = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const target = await resolveInviteShortLink(slug, parseAppLocale(single.get("locale") ?? undefined), createFanpageDependencies(), single);
  if (!target) notFound();
  redirect(target as Route);
}
