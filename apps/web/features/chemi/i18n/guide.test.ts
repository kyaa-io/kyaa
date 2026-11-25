import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { APP_LOCALES } from "../../../i18n/locales";

const milestones = {
  ko: ["한국 시간 자정", "활동 포인트부터", "하루 한 번", "하루 최대 세 명"],
  en: ["midnight Korea time", "Activity points are used first", "once a day per activity and bias", "up to three biases per day"],
  mn: ["Солонгосын цагаар шөнө дунд", "Эхлээд үйл ажиллагааны оноог", "нэг одонд өдөрт нэг удаа", "өдөрт гурав хүртэлх одонд"],
  ja: ["韓国時間の午前0時", "活動ポイントから", "同じ推し・同じコンテンツにつき1日1回", "1日最大3人"],
  "zh-Hans": ["韩国时间零点", "优先使用活动积分", "同一位偶像的同一项活动每天只能获得1次", "每天最多可为3位"],
  "zh-Hant": ["韓國時間午夜", "優先使用活動點數", "同一位偶像的同一項活動每天只能獲得1次", "每天最多可為3位"],
  es: ["medianoche en Corea", "primero los puntos de actividad", "1 vez al día por actividad y por favorito", "hasta 3 favoritos al día"],
  id: ["tengah malam waktu Korea", "poin aktivitas terlebih dahulu", "1 kali sehari per aktivitas untuk setiap idola", "maksimal 3 idola per hari"],
  vi: ["nửa đêm theo giờ Hàn Quốc", "điểm hoạt động trước", "1 lần mỗi ngày cho mỗi hoạt động với mỗi thần tượng", "tối đa 3 thần tượng mỗi ngày"],
  th: ["เที่ยงคืนตามเวลาเกาหลี", "ใช้คะแนนกิจกรรมก่อน", "1 ครั้งต่อวันต่อกิจกรรมสำหรับเมนแต่ละคน", "สูงสุด 3 คนต่อวัน"],
  pt: ["meia-noite no horário da Coreia", "primeiro os pontos de atividade", "1 vez por dia por atividade e por favorito", "até 3 favoritos por dia"],
  fr: ["minuit, heure de Corée", "points d’activité en priorité", "1 fois par jour pour chaque activité et chaque favori", "jusqu’à 3 favoris par jour"],
  ru: ["в полночь по корейскому времени", "Сначала расходуются баллы за активность", "1 раз в день за каждое занятие с каждым кумиром", "до 3 кумиров в день"],
} as const;

for (const locale of APP_LOCALES) {
  it(`preserves the Korean guide's price, reset and bond limits in ${locale}`, () => {
    const { guide } = JSON.parse(readFileSync(resolve(__dirname, "locales", locale, "chemi.json"), "utf8"));
    expect(guide, "guide section").toBeDefined();
    const [midnight, activityFirst, once, three] = milestones[locale];
    expect(guide.dates.match(/\d+\s*P\b|\d+\s*оноогоор/g)).toEqual([locale === "mn" ? "10 оноогоор" : "10P"]);
    expect(guide.dates).toContain(midnight);
    expect(guide.dates).toContain(activityFirst);
    expect(guide.growthDetail).toContain(once);
    expect(guide.growthDetail).toContain(three);
  });
}
