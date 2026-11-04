import type { AppLocale } from "@/i18n/locales";
import { messages as homeMessages } from "@/i18n/catalogs/components__guest-home";

const details = {
  ko: { empty: "현재 공개된 이벤트가 없어요.", error: "일부 이벤트를 불러오지 못했어요.", retry: "다시 시도" },
  en: { empty: "There are no published events right now.", error: "Some events could not be loaded.", retry: "Try again" },
  ja: { empty: "現在公開中のイベントはありません。", error: "一部のイベントを読み込めませんでした。", retry: "再試行" },
  "zh-Hans": { empty: "目前没有已发布的活动。", error: "部分活动加载失败。", retry: "重试" },
  "zh-Hant": { empty: "目前沒有已發布的活動。", error: "部分活動載入失敗。", retry: "重試" },
  es: { empty: "No hay eventos publicados en este momento.", error: "No se pudieron cargar algunos eventos.", retry: "Reintentar" },
  id: { empty: "Belum ada acara yang dipublikasikan saat ini.", error: "Beberapa acara tidak dapat dimuat.", retry: "Coba lagi" },
  vi: { empty: "Hiện chưa có sự kiện nào được công bố.", error: "Không thể tải một số sự kiện.", retry: "Thử lại" },
  th: { empty: "ยังไม่มีกิจกรรมที่เผยแพร่ในขณะนี้", error: "ไม่สามารถโหลดกิจกรรมบางรายการได้", retry: "ลองอีกครั้ง" },
  pt: { empty: "Não há eventos publicados no momento.", error: "Não foi possível carregar alguns eventos.", retry: "Tentar novamente" },
  fr: { empty: "Aucun événement n’est publié pour le moment.", error: "Certains événements n’ont pas pu être chargés.", retry: "Réessayer" },
  ru: { empty: "Сейчас нет опубликованных событий.", error: "Не удалось загрузить некоторые события.", retry: "Повторить" },
} satisfies Record<AppLocale, { empty: string; error: string; retry: string }>;

export function eventsCatalogCopy(locale: AppLocale) {
  return { title: ({ ko: "전체 이벤트", en: "All events", ...homeMessages.allEvents })[locale], ...details[locale] };
}
