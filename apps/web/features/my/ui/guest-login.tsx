"use client";

import { FanAction, type FanActionVariant } from "@/components/fan-ui/fan-action";
import { fanLoginHref } from "@/components/login-href";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import type { AppLocale } from "@/i18n/locales";

/** 비로그인 개인 화면의 로그인 진입. 라벨은 "로그인" 하나, 돌아올 주소는 현재 경로·쿼리·해시다. 강조(primary)는 화면당 하나만 쓴다. */
export function GuestLoginAction({ locale, returnTo, variant = "neutral", fullWidth = false, className }: Readonly<{
  locale: AppLocale;
  returnTo: string;
  variant?: FanActionVariant;
  fullWidth?: boolean;
  className?: string;
}>) {
  return <FanAction variant={variant} fullWidth={fullWidth} className={className} href={fanLoginHref(locale, returnTo)}>{walletCopy(locale).login}</FanAction>;
}
