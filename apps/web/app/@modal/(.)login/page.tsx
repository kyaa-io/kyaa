import { parseAppLocale } from "@/i18n/locales";
import { Suspense } from "react";
import { readCognitoKakaoLoginPolicy } from "@/server/config/public-runtime-config";
import { LoginPage } from "../../../components/login-page";
import { readPublicPrivyAppleLoginPolicy } from "../../../components/privy-apple-login-policy";
import { FanRouteLoading } from "../../../components/fan-ui/fan-route-loading";

export default async function LoginModalRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const locale = parseAppLocale(query.locale);
  return (
    <Suspense
      fallback={<FanRouteLoading locale={locale} presentation="overlay" />}
    >
      <LoginPage
        presentation="overlay"
        appleLoginEnabled={readPublicPrivyAppleLoginPolicy()}
        cognitoKakaoEnabled={readCognitoKakaoLoginPolicy()}
      />
    </Suspense>
  );
}
