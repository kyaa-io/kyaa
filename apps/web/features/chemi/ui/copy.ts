import type { AppLocale } from "@/i18n/locales";
/** Korean uses 케미; other locales retain the English menu name, like HOME and MY. */
const tabLabels: Record<AppLocale, string> = {
  ko: "케미", get mn() { return this.en; }, en: "Chemi", ja: "Chemi", "zh-Hans": "Chemi", "zh-Hant": "Chemi", es: "Chemi",
  id: "Chemi", vi: "Chemi", th: "Chemi", pt: "Chemi", fr: "Chemi", ru: "Chemi",
};
export function chemiTabLabel(locale: AppLocale) { return tabLabels[locale]; }

/** MY 바로가기의 '내 생일 정보' 줄: 이름과 값이 없을 때의 글. MY 생일 화면(언어별 chemi.json 의 myBirth.title·none)과 같은 글이다. */
const myShortcut: Record<AppLocale, { label: string; none: string }> = {
  ko: { label: "내 생일 정보", none: "입력 전" },
  en: { label: "My birth info", none: "Not set" },
  ja: { label: "誕生日情報", none: "未入力" },
  "zh-Hans": { label: "我的生日信息", none: "未填写" },
  "zh-Hant": { label: "我的生日資訊", none: "未填寫" },
  es: { label: "Mis datos de nacimiento", none: "Sin datos" },
  id: { label: "Info lahirku", none: "Belum diisi" },
  vi: { label: "Thông tin ngày sinh của tôi", none: "Chưa nhập" },
  th: { label: "ข้อมูลวันเกิดของฉัน", none: "ยังไม่กรอก" },
  pt: { label: "Meus dados de nascimento", none: "Não preenchido" },
  fr: { label: "Mes infos de naissance", none: "Non renseigné" },
  ru: { label: "Мои данные о рождении", none: "Не указано" },
  mn: { label: "Миний төрсөн өдрийн мэдээлэл", none: "Оруулаагүй" },
};
export function chemiMyShortcutText(locale: AppLocale) {
  return myShortcut[locale];
}
