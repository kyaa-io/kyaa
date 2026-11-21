import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import ko from "@/features/chemi/i18n/locales/ko/chemi.json";
import { mergeMyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import { parseAppLocale } from "@/i18n/locales";
import { starCharacters } from "../copy";
import { MatchScreen } from "./screen";

export const dynamic = "force-dynamic";
export default async function MatchPage({ searchParams }: {
  searchParams: Promise<{ locale?: string; c?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const character = starCharacters.find(row => row.id === params.c)?.id ?? "changha";
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return <FanAppFrame currentPath="/chemi" locale={locale} mainId="match-main">
    <FanContentContainer as="main" id="match-main">
      <ReadingCopyProvider value={catalog}>
        <MatchScreen locale={locale} character={character} birthCopy={mergeMyBirthCopy(ko.myBirth, catalog.myBirth)} />
      </ReadingCopyProvider>
    </FanContentContainer>
  </FanAppFrame>;
}
