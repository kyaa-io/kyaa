"use client";
import type { Route } from "next";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { fanPageReturnPath, fanVerifyHref, sanitizeLiveReturnTo } from "@/features/quiz/domain/live-return-context";
import { useOptionalGroupPage } from "@/features/groups/ui/group-page-context";
import type { AppLocale } from "@/i18n/locales";
import type { MutationFailure } from "./use-content-mutation";

const copy = {
  ko: { title: (name: string) => `${name || "이 아티스트"} 패스포트가 필요해요`, action: "패스포트 만들러 가기", close: "닫기" },
  en: { title: (name: string) => `${name || "This artist"} Passport required`, action: "Create a Passport", close: "Close" },
} as const;

/** The one answer every reaction, comment and write gives when the viewer holds no issued passport of that artist (FAN_WEB_FORBIDDEN). */
export const isPassportRequired = (failure: MutationFailure) => failure === "passport";

export function passportEntryHref(slug: string, locale: AppLocale) {
  const { pathname, search } = window.location;
  return fanVerifyHref(slug, locale, sanitizeLiveReturnTo(fanPageReturnPath(pathname, search, locale)) ?? `/${slug}?locale=${locale}`);
}

/** Shared by every write that can answer the passport-required error: the title and one way to the artist's entry quiz. */
export function PassportRequiredDialog({ failure, slug, name, locale, onClose }: { failure: MutationFailure; slug: string; name?: string; locale: AppLocale; onClose: () => void }) {
  const pageName = useOptionalGroupPage()?.celebrity?.name ?? "", t = locale === "ko" ? copy.ko : copy.en;
  const open = isPassportRequired(failure);
  const href = open ? passportEntryHref(slug, locale) : "";
  return <FanDialog open={open} onOpenChange={next => { if (!next) onClose(); }} title={t.title(name ?? pageName)} closeLabel={t.close} size="sm">
    {href ? <FanAction href={href as Route} onClick={onClose}>{t.action}</FanAction> : null}
  </FanDialog>;
}
