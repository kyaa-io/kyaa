import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { parseAppLocale } from "@/i18n/locales";
import { VotePanel } from "./vote-panel";

export const dynamic = "force-dynamic";
export default async function DonationVotePage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  if (process.env.DONATION_VOTE_ENABLED !== "true") notFound();
  const locale = parseAppLocale((await searchParams).locale);
  return <FanAppFrame locale={locale} currentPath="/events/donation-vote" mainId="donation-vote">
    <FanContentContainer as="main" id="donation-vote"><VotePanel locale={locale} /></FanContentContainer>
  </FanAppFrame>;
}
