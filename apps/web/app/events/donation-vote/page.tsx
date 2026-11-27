import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { VotePanel } from "./vote-panel";

// Public profile photos approved for creator list previews.
const listPhotoConsent = new Set(["aryeom", "changha", "jenny-jeong", "mmnoo-s"]);

export const dynamic = "force-dynamic";
export default async function DonationVotePage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  if (process.env.DONATION_VOTE_ENABLED !== "true") notFound();
  const locale = parseAppLocale((await searchParams).locale);
  const creators = await createPublishedContentRepositoryFromEnvironment().list(toContentLocale(locale)).catch(() => []);
  const profiles = Object.fromEntries(creators.map(({ slug, name, image }) => [
    slug, { name, image: listPhotoConsent.has(slug) ? image : undefined },
  ]));
  return <FanAppFrame locale={locale} currentPath="/events/donation-vote" mainId="donation-vote">
    <FanContentContainer as="main" id="donation-vote"><VotePanel locale={locale} profiles={profiles} /></FanContentContainer>
  </FanAppFrame>;
}
