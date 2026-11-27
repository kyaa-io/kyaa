import type { AppLocale } from "@/i18n/locales";

export const goodsMenuLabel: Record<AppLocale, string> = {
  ko: "굿즈",
  en: "Merch",
  ja: "グッズ",
  "zh-Hans": "周边",
  "zh-Hant": "周邊",
  es: "Merch",
  id: "Merch",
  vi: "Vật phẩm",
  th: "สินค้าที่ระลึก",
  pt: "Produtos",
  fr: "Goodies",
  ru: "Мерч",
  mn: "Мерч",
};

const mileageBalance: Record<AppLocale, string> = {
  ko: "마일리지: {amount} Miles", en: "Mileage: {amount} Miles",
  ja: "マイル：{amount} Miles", "zh-Hans": "里程：{amount} Miles", "zh-Hant": "里程：{amount} Miles",
  es: "Millas: {amount} Miles", id: "Mileage: {amount} Miles", vi: "Dặm: {amount} Miles",
  th: "ไมล์: {amount} Miles", pt: "Milhas: {amount} Miles", fr: "Miles : {amount} Miles",
  ru: "Мили: {amount} Miles", mn: "Миль: {amount} Miles",
};

export function goodsMileageBalance(locale: AppLocale, points: number) {
  const amount = new Intl.NumberFormat(locale, { useGrouping: "always" }).format(points);
  return mileageBalance[locale].replace("{amount}", amount);
}
