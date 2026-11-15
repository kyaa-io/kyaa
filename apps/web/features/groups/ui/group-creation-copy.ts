import type { AppLocale } from "@/i18n/locales";

export const creationDescriptions: Record<AppLocale, { fan: string; hobby: string }> = {
  ko: { fan: "좋아하는 크리에이터의 팬페이지를 신청해요", hobby: "함께할 취미나 브랜드 페이지를 신청해요" },
  en: { fan: "Request a page for a creator you love", hobby: "Request a page for a hobby or brand" },
  ja: { fan: "好きなクリエイターのページを申請", hobby: "趣味やブランドのページを申請" },
  "zh-Hans": { fan: "申请喜欢的创作者的粉丝页", hobby: "申请爱好或品牌页面" },
  "zh-Hant": { fan: "申請喜愛的創作者粉絲專頁", hobby: "申請興趣或品牌頁面" },
  es: { fan: "Solicita una página para tu creador favorito", hobby: "Solicita una página de afición o marca" },
  id: { fan: "Ajukan halaman untuk kreator favoritmu", hobby: "Ajukan halaman untuk hobi atau merek" },
  vi: { fan: "Đăng ký trang cho nhà sáng tạo yêu thích", hobby: "Đăng ký trang sở thích hoặc thương hiệu" },
  th: { fan: "ขอเปิดเพจให้ครีเอเตอร์ที่คุณชอบ", hobby: "ขอเปิดเพจงานอดิเรกหรือแบรนด์" },
  pt: { fan: "Solicite uma página para seu criador favorito", hobby: "Solicite uma página de hobby ou marca" },
  fr: { fan: "Demandez une page pour votre créateur préféré", hobby: "Demandez une page de loisir ou de marque" },
  ru: { fan: "Подайте заявку на страницу любимого автора", hobby: "Подайте заявку на страницу хобби или бренда" },
};
