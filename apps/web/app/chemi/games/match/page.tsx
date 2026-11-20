import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
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
  const { locale: raw, share } = await searchParams;
  const locale = parseAppLocale(raw);
  if (!photos) {
    const { home } = (
      await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)
    ).default;
    return (
      <FanAppFrame locale={locale} currentPath="/chemi" mainId="chemi-main">
        <FanContentContainer as="main" id="chemi-main" tabIndex={-1}>
          <FanHeading as="h1">{home.pair}</FanHeading>
          <FanText as="p" role="meta">{home.ready}</FanText>
        </FanContentContainer>
      </FanAppFrame>
    );
  }
  return (
    <MatchScreen
      locale={locale}
      copy={getMatchCopy(locale)}
      photos={photos}
      share={share ?? null}
    />
  );
}
