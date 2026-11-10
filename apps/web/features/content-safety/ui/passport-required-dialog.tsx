"use client";
import type { Route } from "next";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { fanPageReturnPath, fanVerifyHref, sanitizeLiveReturnTo } from "@/features/quiz/domain/live-return-context";
import { useOptionalGroupPage } from "@/features/groups/ui/group-page-context";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { selectedBiasOptions } from "@/features/selected-bias/domain/selected-bias-pick";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import type { MutationFailure } from "./use-content-mutation";

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

type Copy = { title: (name: string) => string; fallbackName: string; action: string; close: string };
// Passport and "close" follow the wording the other passport-gate lines already use in each language.
const copy: Record<AppLocale, Copy> = {
  ko: { title: name => `${name} 패스포트가 필요해요`, fallbackName: "이 아티스트", action: "패스포트 만들러 가기", close: "닫기" },
  en: { title: name => `${name} Passport required`, fallbackName: "This artist", action: "Create a Passport", close: "Close" },
  ja: { title: name => `${name}のパスポートが必要です`, fallbackName: "このアーティスト", action: "パスポートを作る", close: "閉じる" },
  "zh-Hans": { title: name => `需要${name}的护照`, fallbackName: "该艺人", action: "去创建护照", close: "关闭" },
  "zh-Hant": { title: name => `需要${name}的護照`, fallbackName: "該藝人", action: "前往建立護照", close: "關閉" },
  es: { title: name => `Se necesita el pasaporte de ${name}`, fallbackName: "este artista", action: "Crear pasaporte", close: "Cerrar" },
  id: { title: name => `Paspor ${name} diperlukan`, fallbackName: "artis ini", action: "Buat Paspor", close: "Tutup" },
  vi: { title: name => `Cần Hộ chiếu của ${name}`, fallbackName: "nghệ sĩ này", action: "Tạo Hộ chiếu", close: "Đóng" },
  th: { title: name => `ต้องมีพาสปอร์ตของ${name}`, fallbackName: "ศิลปินคนนี้", action: "สร้างพาสปอร์ต", close: "ปิด" },
  pt: { title: name => `O passaporte de ${name} é necessário`, fallbackName: "este artista", action: "Criar passaporte", close: "Fechar" },
  fr: { title: name => `Le passeport de ${name} est requis`, fallbackName: "cet artiste", action: "Créer un passeport", close: "Fermer" },
  ru: { title: name => `Нужен паспорт ${name}`, fallbackName: "этого артиста", action: "Создать паспорт", close: "Закрыть" },
};

/**
 * FAN_WEB_FORBIDDEN is also the answer for a viewer role, an author restriction or a missing page membership, so the code alone does not say
 * "no passport". The dialog opens only on a fan page, once the viewer's own passport list (the summary the header already reads, requested only
 * after this failure) has loaded and holds none of this artist's; every other 403 keeps the existing member-required line.
 */
export function usePassportRequired(failure: MutationFailure, slug: string | undefined, locale: AppLocale) {
  const kind = useOptionalGroupPage()?.kind, auth = useByUsAuth(), active = failure === "passport" && Boolean(slug) && kind === "fan";
  const summary = useOwnedFanResource(active && auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  if (!active || summary.state.status !== "ready") return false;
  return !selectedBiasOptions(summary.state.data).some(option => option.slug === slug);
}

export function passportEntryHref(slug: string, locale: AppLocale) {
  const { pathname, search } = window.location;
  return fanVerifyHref(slug, locale, sanitizeLiveReturnTo(fanPageReturnPath(pathname, search, locale)) ?? `/${slug}?locale=${locale}`);
}

/** Shared by every write that can answer FAN_WEB_FORBIDDEN: the title and one way to the artist's entry quiz, only for a true missing passport. */
export function PassportRequiredDialog({ failure, slug, name, locale, onClose }: { failure: MutationFailure; slug: string; name?: string; locale: AppLocale; onClose: () => void }) {
  const pageName = useOptionalGroupPage()?.celebrity?.name ?? "", t = copy[locale] ?? copy.en;
  const open = usePassportRequired(failure, slug, locale);
  const href = open ? passportEntryHref(slug, locale) : "";
  return <FanDialog open={open} onOpenChange={next => { if (!next) onClose(); }} title={t.title(name ?? (pageName || t.fallbackName))} closeLabel={t.close} size="sm">
    {href ? <FanAction href={href as Route} onClick={onClose}>{t.action}</FanAction> : null}
  </FanDialog>;
}
