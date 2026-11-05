import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { ProofsScreen } from "@/features/passport-proofs/ui/proofs-screen";
import { parseAppLocale } from "@/i18n/locales";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
};

export default async function ProofsPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  return (
    <FanAppFrame locale={locale} currentPath={`/c/${slug}/proofs`} mainId="proofs-main">
      <FanContentContainer as="main" id="proofs-main" tabIndex={-1}>
        <ProofsScreen locale={locale} slug={slug} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
