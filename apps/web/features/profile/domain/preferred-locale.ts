import { z } from "zod";
import { APP_LOCALES } from "../../../i18n/locales";

export const preferredLocaleSchema = z.enum(APP_LOCALES);

export type PreferredLocale = z.infer<typeof preferredLocaleSchema>;
