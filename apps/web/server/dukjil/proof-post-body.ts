import { APP_LOCALES, type AppLocale } from "@/i18n/locales";

// Default body of the public "I verified" post when the member writes no one-liner. Submit and resubmit compute the body on the server
// (note or this default in the request language) and pass it as p_post_body; the approval call carries no body argument.
export const PROOF_POST_BODY: Record<AppLocale, string> = {
  ko: "인증했어요",
  en: "I'm verified!",
  ja: "認証しました",
  "zh-Hans": "我已完成认证",
  "zh-Hant": "我已完成認證",
  es: "¡Ya estoy verificado!",
  id: "Aku sudah terverifikasi!",
  vi: "Mình đã xác minh rồi!",
  th: "ยืนยันแล้ว!",
  pt: "Já estou verificado!",
  fr: "Je suis vérifié !",
  ru: "Я подтвердил(а)!",
};

// Accepts a locale or a browser language tag (fr-FR, zh-TW, pt-BR) and falls back to Korean.
export function proofPostBody(locale: string | null | undefined): string {
  const tag = (locale ?? "").trim();
  const exact = (APP_LOCALES as readonly string[]).find((l) => l.toLowerCase() === tag.toLowerCase());
  if (exact) return PROOF_POST_BODY[exact as AppLocale];
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) return PROOF_POST_BODY[/hant|tw|hk|mo/.test(lower) ? "zh-Hant" : "zh-Hans"];
  const primary = lower.split("-")[0];
  const match = (APP_LOCALES as readonly string[]).find((l) => l.toLowerCase() === primary);
  return match ? PROOF_POST_BODY[match as AppLocale] : PROOF_POST_BODY.ko;
}
