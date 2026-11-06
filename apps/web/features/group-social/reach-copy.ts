import { messages } from "@/i18n/catalogs/features__group-social__reach";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { reachSource } from "./reach-source";

export type ReachKey = keyof typeof reachSource;
export const reachText = (locale: AppLocale, key: ReachKey) => translate(locale, messages[key], locale === "ko" ? reachSource[key].ko : reachSource[key].en);
