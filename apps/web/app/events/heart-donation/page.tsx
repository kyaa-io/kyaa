import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { HeartDonationDetail } from "@/features/rankings/ui/heart-donation-detail";
import { heartDonationTitle } from "@/features/rankings/ui/heart-donation-copy";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { jjinfanGaugeEnabled } from "@/server/config/feature-flags";
import { heartDonationEvent } from "@/server/config/heart-donation-event";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  if (!jjinfanGaugeEnabled()) return {};
  return publicMetadata({ path: "/events/heart-donation", locale, title: `${heartDonationTitle(locale, heartDonationEvent())} | kyaa`, description: rankingsText(locale, "hdPitch") });
}

/** 찐팬 하트 후원 이벤트 상세(대표 2026-11-11). 홈 줄과 같은 서버 플래그가 꺼져 있으면(운영 기본) 페이지가 없다. */
export default async function HeartDonationPage({ searchParams }: Props) {
  if (!jjinfanGaugeEnabled()) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  return <FanAppFrame locale={locale} currentPath="/events/heart-donation" mainId="heart-donation-main">
    <FanContentContainer as="main" id="heart-donation-main" tabIndex={-1}>
      <HeartDonationDetail locale={locale} event={heartDonationEvent()} />
    </FanContentContainer>
  </FanAppFrame>;
}
