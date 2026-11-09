import { rewardedExchangeDecision } from "@/features/group-wallet/rewarded-config";
import { defaultShareImage, SITE_URL, NO_INDEX, isPrivatePath, isRehearsalPath, openGraphLocale } from "@/seo/metadata";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { LocaleProvider } from "../components/locale-provider";
import { GroupsReleaseProvider } from "@/features/groups/ui/groups-release";
import { DocumentLocale } from "../components/document-locale";
import { FanNavigationProgress } from "@/components/fan-ui/fan-navigation-progress";
import { PrivyRoot } from "@/features/auth/client/privy-root";
import { publicRuntimeConfig } from "../server/config/public-runtime-config";
import { isAwsHosting } from "../server/config/hosting";
import { AcquisitionSessionTracker } from "../features/analytics/client/acquisition-session-tracker";
import { OutboundLinkTracker } from "../features/analytics/client/outbound-link-tracker";
import { PageViewTracker } from "../features/analytics/client/page-view-tracker";
import { GoogleAnalytics } from "../features/analytics/client/google-analytics";
import { AwsPerformanceTelemetry } from "../features/analytics/client/aws-performance-telemetry";
import { DeferredRootClients } from "../components/deferred-root-clients";
import { BYUS_BRAND_ICONS } from "./brand-icons";
import { AuthTransitionBoundary } from "../components/auth-transition-boundary";
import { FanToastProvider } from "../components/fan-ui/fan-toast";
import { parseAppLocale, type AppLocale } from "../i18n/locales";
import "./globals.css";

const DESCRIPTIONS: Record<AppLocale, string> = {
  ko: "최애의 라이브와 함께한 순간을 팬 패스포트에 기록하세요.",
  en: "Record moments with each of your favorites in a Fan Passport.",
  ja: "推しのライブと過ごした瞬間をFan Passportに記録しましょう。",
  "zh-Hans": "将与喜爱的艺人一起度过的直播时刻记录在Fan Passport中。",
  "zh-Hant": "將與喜愛的藝人一起度過的直播時刻記錄在Fan Passport中。",
  es: "Guarda en Fan Passport los momentos que viviste en los directos de tus artistas favoritos.",
  id: "Catat momen saat menonton siaran langsung idola favoritmu di Fan Passport.",
  vi: "Lưu lại những khoảnh khắc xem trực tiếp cùng nghệ sĩ bạn yêu thích trong Fan Passport.",
  th: "บันทึกช่วงเวลาที่ได้ชมไลฟ์ของศิลปินคนโปรดไว้ใน Fan Passport",
  pt: "Registe no Fan Passport os momentos das transmissões dos seus artistas favoritos.",
  fr: "Enregistrez dans Fan Passport les moments vécus pendant les directs de vos artistes préférés.",
  ru: "Записывайте моменты с каждым из ваших любимых персонажей в Fan Passport.",

};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = parseAppLocale(requestHeaders.get("x-byus-locale"));
  return {
    metadataBase: new URL(SITE_URL),
    ...((isPrivatePath(requestHeaders.get("x-byus-pathname") ?? "") || isRehearsalPath(requestHeaders.get("x-byus-pathname") ?? "")) ? { robots: NO_INDEX } : {}),
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: {
        ...(process.env.NAVER_SITE_VERIFICATION ? { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } : {}),
        ...(process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : {}),
      },
    },
    title: "Kyaa. Every Fan Moment Counts.",
    description: DESCRIPTIONS[locale],
    manifest: `/manifest.webmanifest?locale=${locale}`,
    icons: BYUS_BRAND_ICONS,
    appleWebApp: { capable: true, title: "kyaa", statusBarStyle: "default" },
    openGraph: { locale: openGraphLocale(locale), siteName: "kyaa", type: "website", images: [{ url: defaultShareImage(), width: 1200, height: 630, alt: "Kyaa. Every Fan Moment Counts." }] },
    twitter: { card: "summary_large_image", images: [{ url: defaultShareImage(), alt: "Kyaa. Every Fan Moment Counts." }] },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = parseAppLocale(requestHeaders.get("x-byus-locale"));
  const rewardedExchange = rewardedExchangeDecision(process.env);
  const { authProvider, privyAppId, testAccountLoginEnabled, appleLoginEnabled, ga4MeasurementId } = publicRuntimeConfig();
  return (
    <html lang={locale}>
      <body>
        {rewardedExchange.enabled && <meta name="kyaa-rewarded-ad-unit" content={rewardedExchange.adUnit} />}
        <LocaleProvider initialLocale={locale}>
        <GroupsReleaseProvider enabled={process.env.KYAA_GROUPS_ENABLED === "true"}>
        <PrivyRoot
          appId={privyAppId}
          authProvider={authProvider}
          appleLoginEnabled={appleLoginEnabled}
          testAccountLoginEnabled={testAccountLoginEnabled}
        >
          <DeferredRootClients slot="before" />
          {isAwsHosting() && <AwsPerformanceTelemetry />}
          <Suspense fallback={null}>
            <AcquisitionSessionTracker />
            <PageViewTracker />
            {ga4MeasurementId && <GoogleAnalytics measurementId={ga4MeasurementId} />}
            <OutboundLinkTracker />
          </Suspense>
          <Suspense fallback={null}>
            <DocumentLocale />
          </Suspense>
          <Suspense fallback={null}><FanNavigationProgress /></Suspense>
          <AuthTransitionBoundary modal={modal}>{children}</AuthTransitionBoundary>
          <FanToastProvider />
          <DeferredRootClients slot="after" />
        </PrivyRoot>
        </GroupsReleaseProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
