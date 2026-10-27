import type { AppLocale } from "@/i18n/locales";
import { messages as homeMessages } from "@/i18n/catalogs/components__guest-home";

const details = {
  ko: { intro: "홈에서 소개한 이벤트와 소식을 한눈에 확인하세요.", empty: "현재 공개된 이벤트가 없어요.", error: "일부 이벤트를 불러오지 못했어요.", retry: "다시 시도" },
  en: { intro: "Explore the events and news featured on home.", empty: "There are no published events right now.", error: "Some events could not be loaded.", retry: "Try again" },
  ja: { intro: "ホームで紹介したイベントやお知らせをまとめて確認できます。", empty: "現在公開中のイベントはありません。", error: "一部のイベントを読み込めませんでした。", retry: "再試行" },
  "zh-Hans": { intro: "集中查看首页推荐的活动和消息。", empty: "目前没有已发布的活动。", error: "部分活动加载失败。", retry: "重试" },
  "zh-Hant": { intro: "集中查看首頁推薦的活動和消息。", empty: "目前沒有已發布的活動。", error: "部分活動載入失敗。", retry: "重試" },
  es: { intro: "Explora los eventos y las novedades de la página de inicio.", empty: "No hay eventos publicados en este momento.", error: "No se pudieron cargar algunos eventos.", retry: "Reintentar" },
  id: { intro: "Jelajahi acara dan kabar yang ditampilkan di beranda.", empty: "Belum ada acara yang dipublikasikan saat ini.", error: "Beberapa acara tidak dapat dimuat.", retry: "Coba lagi" },
  vi: { intro: "Xem các sự kiện và tin tức được giới thiệu trên trang chủ.", empty: "Hiện chưa có sự kiện nào được công bố.", error: "Không thể tải một số sự kiện.", retry: "Thử lại" },
  th: { intro: "ดูกิจกรรมและข่าวสารที่แนะนำบนหน้าหลักได้ในที่เดียว", empty: "ยังไม่มีกิจกรรมที่เผยแพร่ในขณะนี้", error: "ไม่สามารถโหลดกิจกรรมบางรายการได้", retry: "ลองอีกครั้ง" },
  pt: { intro: "Explore os eventos e as novidades em destaque na página inicial.", empty: "Não há eventos publicados no momento.", error: "Não foi possível carregar alguns eventos.", retry: "Tentar novamente" },
  fr: { intro: "Retrouvez les événements et les actualités présentés sur la page d’accueil.", empty: "Aucun événement n’est publié pour le moment.", error: "Certains événements n’ont pas pu être chargés.", retry: "Réessayer" },
  ru: { intro: "Все события и новости, представленные на главной странице.", empty: "Сейчас нет опубликованных событий.", error: "Не удалось загрузить некоторые события.", retry: "Повторить" },
} satisfies Record<AppLocale, { intro: string; empty: string; error: string; retry: string }>;

export function eventsCatalogCopy(locale: AppLocale) {
  return { title: ({ ko: "전체 이벤트", en: "All events", ...homeMessages.allEvents })[locale], ...details[locale] };
}
