"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Route } from "next";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { useByUsSession } from "@/components/byus-session-provider";
import { sanitizeReturnTo } from "@/components/login-intent";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { participationResponseSchema } from "@/features/connect/kyaa-wave-participation";
import { participationCopy } from "@/features/connect/kyaa-wave-participation-copy";
import { usePageLocale } from "@/components/locale-provider";
import { WAVE_FANPAGE_SLUG } from "../domain/wave-programs";
import type { AppLocale } from "@/i18n/locales";
import { useFanpageResource } from "./use-fanpage-resource";
import { WavePrivacyNotice } from "./wave-privacy";
import styles from "./wave-access-boundary.module.css";

const WaveParticipantNameContext = createContext<string | null>(null);
export const useWaveParticipantName = () => useContext(WaveParticipantNameContext);

const parse = (value: unknown) => participationResponseSchema.parse(value);
const help: Record<AppLocale, string> = {
  ko: "로그인하고 행사 체크인을 마치면 미션과 팬페이지를 볼 수 있어요.",
  en: "Sign in and complete event check-in to view your missions and the fan page.",
  ja: "ログインしてイベントのチェックインを完了すると、ミッションとファンページを確認できます。",
  "zh-Hans": "登录并完成活动签到后，即可查看任务和粉丝页面。",
  "zh-Hant": "登入並完成活動報到後，即可查看任務和粉絲頁面。",
  es: "Inicia sesión y completa el registro del evento para ver tus misiones y la página de fans.",
  id: "Masuk dan selesaikan check-in acara untuk melihat misi dan halaman penggemar.",
  vi: "Đăng nhập và hoàn tất điểm danh sự kiện để xem nhiệm vụ và trang người hâm mộ.",
  th: "เข้าสู่ระบบและเช็กอินงานให้เสร็จเพื่อดูภารกิจและหน้าแฟนเพจ",
  pt: "Entre e conclua o check-in do evento para ver suas missões e a página de fãs.",
  fr: "Connectez-vous et confirmez votre présence à l’événement pour voir vos missions et la page des fans.",
  ru: "Войдите в систему и пройдите регистрацию на мероприятие, чтобы просмотреть свои задания и страницу для фанатов.",

};
/**
 * Routes that open as intercepted overlays (app/@modal: login, benefits, stamps) keep the page underneath mounted, so this
 * boundary keeps running while the address bar already shows the overlay. /connect and /onboarding are full pages of their own.
 * No redirect may run on any of them: on /login it wrapped /login into returnTo again on every pass.
 */
export function isOverlayPath(path: string) {
  return /^\/(?:login|benefits|stamps|connect|onboarding)(?:[/?#]|$)/.test(path);
}
export function WaveAccessBoundary({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const auth = usePrivy(), session = useByUsSession(), router = useRouter(), path = usePathname(), query = useSearchParams();
  const copy = participationCopy[locale];
  const resource = useFanpageResource(auth.ready && auth.authenticated ? "/api/kyaa-wave/participation" : null, parse);
  const destinationQuery = new URLSearchParams(query.toString());
  destinationQuery.delete("code");
  const returnTo = sanitizeReturnTo(`${path}${destinationQuery.size ? `?${destinationQuery}` : ""}`);
  const overlay = isOverlayPath(path);
  const code = query.getAll("code").length === 1 ? query.get("code") : null;
  const checkinHref = `/connect/kyaa-wave/participate?${new URLSearchParams({ locale, returnTo, ...(code ? { code } : {}) })}`;
  const loginHref = `/login?${new URLSearchParams({ locale, returnTo: checkinHref })}`;
  const needsCheckin = auth.authenticated && resource.state.status === "ready" && !resource.state.data.participation;
  useEffect(() => {
    if (!auth.ready || !session.ready || overlay) return;
    if (!auth.authenticated) router.replace(loginHref as Route);
    else if (needsCheckin) router.replace(checkinHref as Route);
  }, [auth.ready, auth.authenticated, session.ready, needsCheckin, overlay, router, loginHref, checkinHref]);
  if (auth.ready && auth.authenticated && resource.state.status === "ready" && resource.state.data.participation) return <WaveParticipantNameContext.Provider value={resource.state.data.participation.displayName ?? null}>{children}</WaveParticipantNameContext.Provider>;
  return <FanAppFrame locale={locale} mainId="wave-access-main"><FanContentContainer as="main" id="wave-access-main" className={styles.main} tabIndex={-1}>
    <p className={styles.eyebrow}>KYAA WAVE · 2026.10.22</p>
    <FanHeading as="h1">Kyaa Wave</FanHeading><WavePrivacyNotice locale={locale} /><p className={styles.help}>{help[locale]}</p>
    {!auth.ready || auth.authenticated && resource.state.status === "loading" ? <p role="status">{copy.loading}</p>
      : !auth.authenticated ? <FanAction variant="primary" href={loginHref}>{copy.login}</FanAction>
      : resource.state.status === "error" ? <div><p role="alert">{copy.unavailable}</p><FanAction onClick={resource.retry}>{copy.retry}</FanAction></div>
      : <FanAction variant="primary" href={checkinHref}>{copy.start}</FanAction>}
  </FanContentContainer></FanAppFrame>;
}

export function WaveRouteBoundary({ slug, children }: { slug: string; children: ReactNode }) {
  const locale = usePageLocale();
  return slug === WAVE_FANPAGE_SLUG ? <WaveAccessBoundary locale={locale}>{children}</WaveAccessBoundary> : children;
}
