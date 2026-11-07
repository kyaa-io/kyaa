import type { Route } from "next";
import { redirect } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";

export const dynamic = "force-dynamic";

/** The per-creator ticket history moved into the 덕질 wallet history (2026-11-08); old links land there. */
export default async function CreatorTicketHistoryPage({ searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const query = await searchParams;
  redirect(`/benefits?locale=${parseAppLocale(query.locale)}#wallet-history` as Route);
}
