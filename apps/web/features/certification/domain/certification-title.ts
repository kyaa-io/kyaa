import { messages } from "@/i18n/catalogs/features__quiz__ui__quiz-questions-screen";
import type { AppLocale } from "@/i18n/locales";

/** The name the database sends for the entry quiz, in Korean and in English. Every other locale receives the English one. */
const ENTRY_QUIZ_TITLES: ReadonlySet<string> = new Set(["Official Fan 인증 퀴즈", "Official Fan Quiz"]);

/** The quiz that starts a Passport is named in the viewer's language here, because the database holds only two spellings. */
export function entryQuizName(locale: AppLocale): string {
  if (locale === "ko") return "팬 인증 퀴즈";
  if (locale === "en") return "Fan verification quiz";
  return messages.m621c5de2e1cf[locale];
}

/** The localized name of a known certification, or null when the title is the creator's own text and goes through automatic translation. */
export function knownCertificationTitle(locale: AppLocale, item: { kind: string; title: string }): string | null {
  return item.kind === "quiz" && ENTRY_QUIZ_TITLES.has(item.title) ? entryQuizName(locale) : null;
}
