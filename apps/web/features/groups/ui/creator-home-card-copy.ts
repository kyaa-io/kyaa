import type { AppLocale } from '@/i18n/locales';
type Card = readonly [verification: string, description: string, requirements: string, schedule: string, calendar: string];
const copy: Record<AppLocale, Card> = {
 ko: ['찐팬인증', '조건을 확인하고 인증을 제출해요.', '인증 조건 확인', '다가오는 일정', '캘린더 크게 보기'],
 en: ['Fan verification', 'Check the requirements and submit your proof.', 'Check requirements', 'Upcoming schedule', 'View calendar'],
 ja: ['ファン認証', '条件を確認して認証を提出しましょう。', '認証条件を確認', '今後のスケジュール', 'カレンダーを大きく見る'],
 'zh-Hans': ['粉丝认证', '确认条件并提交认证。', '查看认证条件', '即将到来的日程', '查看大日历'],
 'zh-Hant': ['粉絲認證', '確認條件並提交認證。', '查看認證條件', '即將到來的行程', '查看大日曆'],
 es: ['Verificación de fan', 'Revisa los requisitos y envía tu prueba.', 'Ver requisitos', 'Próximos eventos', 'Ver calendario'],
 id: ['Verifikasi penggemar', 'Periksa persyaratan dan kirim bukti Anda.', 'Lihat persyaratan', 'Jadwal mendatang', 'Lihat kalender'],
 vi: ['Xác minh người hâm mộ', 'Xem điều kiện và gửi minh chứng của bạn.', 'Xem điều kiện', 'Lịch sắp tới', 'Xem lịch'],
 th: ['ยืนยันแฟน', 'ตรวจสอบเงื่อนไขและส่งหลักฐานของคุณ', 'ดูเงื่อนไขการยืนยัน', 'กำหนดการที่กำลังจะมาถึง', 'ดูปฏิทิน'],
 pt: ['Verificação de fã', 'Confira os requisitos e envie sua comprovação.', 'Ver requisitos', 'Próximos eventos', 'Ver calendário'],
 fr: ['Vérification fan', 'Consultez les conditions et envoyez votre preuve.', 'Voir les conditions', 'Prochains événements', 'Voir le calendrier'],
 ru: ['Проверка фаната', 'Проверьте условия и отправьте подтверждение.', 'Посмотреть условия', 'Ближайшие события', 'Открыть календарь'],
};
export function creatorHomeCardCopy(locale: AppLocale) {
 const [verification, description, requirements, schedule, calendar] = copy[locale] ?? copy.en;
 return { verification, description, requirements, schedule, calendar };
}
