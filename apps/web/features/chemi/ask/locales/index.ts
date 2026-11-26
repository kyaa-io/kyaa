import type { AppLocale } from "@/i18n/locales";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { id as indonesian } from "./id";
import { ja } from "./ja";
import { mn } from "./mn";
import { pt } from "./pt";
import { ru } from "./ru";
import { th } from "./th";
import type { AskPack } from "./types";
import { vi } from "./vi";
import { zhHans } from "./zh-Hans";
import { zhHant } from "./zh-Hant";

/** 한국어 밖 언어의 질문하기 문구. 한국어 원문은 ../lines.ts 에 있다. */
export const askPacks: Record<Exclude<AppLocale, "ko">, AskPack> = {
  en, ja, "zh-Hans": zhHans, "zh-Hant": zhHant, es, id: indonesian, vi, th, pt, fr, ru, mn,
};
