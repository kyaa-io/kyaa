import { redirectTo } from "@/lib/navigation/untyped";
import type { Route } from "next";
import { parseAppLocale } from "@/i18n/locales";

export const dynamic = "force-dynamic";

/** The per-creator ticket history is the wallet history on /my/wallet (the 덕질 screen has no history section since the 4차 layout); old links land there. */
export default async function CreatorTicketHistoryPage({ searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const query = await searchParams;
  redirectTo(`/my/wallet?locale=${parseAppLocale(query.locale)}` as Route);
}
