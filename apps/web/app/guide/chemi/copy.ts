import type { AppLocale } from "@/i18n/locales";

/** 케미 안내 화면의 제목·배지·버튼·친밀 라벨(13개 언어). 본문 문단은 chemi.json 의 guide 와 page.tsx 의 albumGuide. */
export const copy: Record<AppLocale, { title: string; beta: string; start: string; affinity: string }> = {
  ko: { title: "케미 탭 안내", beta: "베타 운영 중", start: "케미 시작하기", affinity: "친밀" },
  en: { title: "Chemi guide", beta: "In beta", start: "Start Chemi", affinity: "Affinity" },
  ja: { title: "ケミガイド", beta: "ベータ運営中", start: "ケミを始める", affinity: "親密度" },
  "zh-Hans": { title: "Chemi 指南", beta: "测试运营中", start: "开始 Chemi", affinity: "亲密度" },
  "zh-Hant": { title: "Chemi 指南", beta: "測試營運中", start: "開始 Chemi", affinity: "親密度" },
  es: { title: "Guía de Chemi", beta: "En beta", start: "Empezar Chemi", affinity: "Vínculo" },
  id: { title: "Panduan Chemi", beta: "Dalam beta", start: "Mulai Chemi", affinity: "Kedekatan" },
  vi: { title: "Hướng dẫn Chemi", beta: "Đang chạy thử", start: "Bắt đầu Chemi", affinity: "Thân thiết" },
  th: { title: "คู่มือ Chemi", beta: "กำลังทดลองใช้", start: "เริ่มใช้ Chemi", affinity: "ความสนิท" },
  pt: { title: "Guia do Chemi", beta: "Em beta", start: "Começar o Chemi", affinity: "Vínculo" },
  fr: { title: "Guide Chemi", beta: "En bêta", start: "Commencer Chemi", affinity: "Lien" },
  ru: { title: "Руководство по Chemi", beta: "Бета-версия", start: "Начать Chemi", affinity: "Близость" },
  mn: { title: "Кэмигийн гарын авлага", beta: "Туршилтын хувилбар", start: "Кэмиг эхлүүлэх", affinity: "Дотно байдал" },
};
