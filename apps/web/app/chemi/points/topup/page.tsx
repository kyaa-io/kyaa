import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";
export default async function PointTopup({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  if (!chemiEnabled() || process.env.APP_ENV !== "dev") notFound();
  const locale = parseAppLocale((await searchParams).locale);
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="topup-main">
      <FanContentContainer as="main" id="topup-main">
        <Checkout locale={locale} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
