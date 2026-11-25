import type { AppLocale } from "@/i18n/locales";

/** 광고성 정보 수신 동의(선택). title은 체크·토글 이름, detail은 목적·수단·철회 방법이다. */
export const marketingConsentCopy: Record<AppLocale, { title: string; detail: string }> = {
  ko: { title: "이벤트·혜택 소식 메일 받기 (선택)", detail: "래플·이벤트·혜택 안내를 이메일로 보내요. 설정의 알림에서 언제든 끌 수 있어요." },
  en: { title: "Email me event and offer news (optional)", detail: "We email you about raffles, events and offers. Turn it off anytime in Settings > Notifications." },
  ja: { title: "イベント・特典のお知らせメールを受け取る（任意）", detail: "ラッフル・イベント・特典の案内をメールで送ります。設定の通知からいつでもオフにできます。" },
  "zh-Hans": { title: "接收活动与优惠邮件（可选）", detail: "我们会通过电子邮件发送抽奖、活动与优惠通知。可随时在“设置 > 通知”中关闭。" },
  "zh-Hant": { title: "接收活動與優惠郵件（選填）", detail: "我們會透過電子郵件寄送抽獎、活動與優惠通知。可隨時在「設定 > 通知」中關閉。" },
  es: { title: "Recibir correos de eventos y ofertas (opcional)", detail: "Te enviamos por correo novedades de sorteos, eventos y ofertas. Puedes desactivarlo cuando quieras en Ajustes > Notificaciones." },
  id: { title: "Terima email acara dan penawaran (opsional)", detail: "Kami mengirim email tentang undian, acara, dan penawaran. Matikan kapan saja di Pengaturan > Notifikasi." },
  vi: { title: "Nhận email về sự kiện và ưu đãi (không bắt buộc)", detail: "Chúng tôi gửi email về rút thăm, sự kiện và ưu đãi. Bạn có thể tắt bất cứ lúc nào trong Cài đặt > Thông báo." },
  th: { title: "รับอีเมลข่าวกิจกรรมและสิทธิพิเศษ (ไม่บังคับ)", detail: "เราจะส่งอีเมลเกี่ยวกับการจับรางวัล กิจกรรม และสิทธิพิเศษ ปิดได้ทุกเมื่อที่ การตั้งค่า > การแจ้งเตือน" },
  pt: { title: "Receber e-mails de eventos e ofertas (opcional)", detail: "Enviamos e-mails sobre sorteios, eventos e ofertas. Desative quando quiser em Configurações > Notificações." },
  fr: { title: "Recevoir les e-mails d’événements et d’offres (facultatif)", detail: "Nous vous envoyons par e-mail les tirages, événements et offres. Désactivez-les à tout moment dans Paramètres > Notifications." },
  ru: { title: "Получать письма о событиях и предложениях (по желанию)", detail: "Мы присылаем письма о розыгрышах, событиях и предложениях. Отключить можно в любой момент: Настройки > Уведомления." },
  mn: { title: "Арга хэмжээ, урамшууллын имэйл авах (заавал биш)", detail: "Сугалаа, арга хэмжээ, урамшууллын мэдээг имэйлээр илгээнэ. Тохиргоо > Мэдэгдэл хэсгээс хүссэн үедээ унтрааж болно." },
};
