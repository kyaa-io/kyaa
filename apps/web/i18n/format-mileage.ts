import { parseAppLocale, type AppLocale } from "./locales";

const units: Record<AppLocale, string> = {
  ko: "마일리지", en: "miles", ja: "マイル", mn: "миль",
  "zh-Hans": "里程", "zh-Hant": "里程", es: "millas", id: "mil",
  vi: "dặm", th: "ไมล์", pt: "milhas", fr: "miles", ru: "миль",
};

export function formatMileage(value: number, locale: string, signDisplay: Intl.NumberFormatOptions["signDisplay"] = "auto", part: "text" | "unit" = "text") {
  const language = parseAppLocale(locale);
  const number = new Intl.NumberFormat(language, { signDisplay, useGrouping: "always" }).format(value);
  const plural = new Intl.PluralRules(language).select(Math.abs(value));
  const unit = language === "ru"
    ? plural === "one" ? "миля" : plural === "few" || plural === "other" ? "мили" : "миль"
    : plural === "one" && ["en", "es", "pt", "fr"].includes(language) && Math.abs(value) === 1
      ? units[language].slice(0, -1) : units[language];
  return part === "unit" ? unit : `${number} ${unit}`;
}
