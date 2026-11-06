import { messages } from "@/i18n/catalogs/features__media__gallery";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { gallerySource } from "./gallery-source";

export const galleryTitle = (locale: AppLocale) => translate(locale, messages.gallery, locale === "ko" ? gallerySource.gallery.ko : gallerySource.gallery.en);
export const noPostsText = (locale: AppLocale) => translate(locale, messages.noPosts, locale === "ko" ? gallerySource.noPosts.ko : gallerySource.noPosts.en);
export const viewAllText = (locale: AppLocale) => translate(locale, messages.viewAll, locale === "ko" ? gallerySource.viewAll.ko : gallerySource.viewAll.en);
