import type { AppLocale } from "./locales";

export const languageSettings: Record<AppLocale, { website: string; email: string }> = {
  ko: { website: "사이트 언어", email: "이메일 언어" },
  en: { website: "Website language", email: "Email language" },
  ja: { website: "サイトの言語", email: "メールの言語" },
  "zh-Hans": { website: "网站语言", email: "邮件语言" },
  "zh-Hant": { website: "網站語言", email: "電子郵件語言" },
  es: { website: "Idioma del sitio", email: "Idioma de los correos" },
  id: { website: "Bahasa situs", email: "Bahasa email" },
  vi: { website: "Ngôn ngữ trang web", email: "Ngôn ngữ email" },
  th: { website: "ภาษาเว็บไซต์", email: "ภาษาอีเมล" },
  pt: { website: "Idioma do site", email: "Idioma dos emails" },
  fr: { website: "Langue du site", email: "Langue des e-mails" },
  ru: { website: "Язык веб-сайта", email: "Язык электронной почты" },

};
