import type { AppLocale } from "@/i18n/locales";

const earned = {
  ko: "포인트 {0}점을 받았어요",
  en: "You earned {0} points",
  ja: "{0}ポイントを獲得しました",
  "zh-Hans": "获得了 {0} 积分",
  "zh-Hant": "獲得了 {0} 點數",
  es: "Has ganado {0} puntos",
  id: "Anda mendapat {0} poin",
  vi: "Bạn nhận được {0} điểm",
  th: "คุณได้รับ {0} พอยต์",
  pt: "Você ganhou {0} pontos",
  fr: "Vous avez gagné {0} points",
  ru: "Начислено баллов: {0}",
} satisfies Record<AppLocale, string>;

export const pointRewardAnnouncement = (locale: AppLocale, points: number) =>
  earned[locale].replace("{0}", points.toLocaleString(locale));

// C8: a mission finished on another screen (a post on the board, a comment under a post) is told by a toast titled with the mission.
const missionDone = {
  ko: "{0} 미션 완료", en: "{0} mission done", ja: "{0}ミッション達成", "zh-Hans": "{0}任务完成", "zh-Hant": "{0}任務完成", es: "Misión {0} completada",
  id: "Misi {0} selesai", vi: "Hoàn thành nhiệm vụ {0}", th: "ภารกิจ{0}สำเร็จ", pt: "Missão {0} concluída", fr: "Mission {0} terminée", ru: "Миссия «{0}» выполнена",
} satisfies Record<AppLocale, string>;

export const missionDoneTitle = (locale: AppLocale, mission: string) => missionDone[locale].replace("{0}", mission);
