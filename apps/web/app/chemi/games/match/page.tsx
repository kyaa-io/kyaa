import { notFound } from "next/navigation";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";
import { getMatchPhotos } from "./photos";
import { getMatchCopy } from "./copy";
import { MatchScreen } from "./screen";

export const dynamic = "force-dynamic";

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[]; share?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const photos = getMatchPhotos();
  if (!photos) notFound();
  const { locale: raw, share } = await searchParams;
  const locale = parseAppLocale(raw);
  return (
    <MatchScreen
      locale={locale}
      copy={getMatchCopy(locale)}
      photos={photos}
      share={share ?? null}
    />
  );
}
