import type { AppLocale } from '@/i18n/locales';
type Card = readonly [schedule: string, calendar: string, joinTitle: string];
const copy: Record<AppLocale, Card> = {
 ko: ['다가오는 일정', '캘린더 크게 보기', '가입한 팬이 할 수 있는 일'],
 en: ['Upcoming schedule', 'View calendar', 'What joined fans can do'],
 ja: ['今後のスケジュール', 'カレンダーを大きく見る', '参加したファンができること'],
 'zh-Hans': ['即将到来的日程', '查看大日历', '已加入的粉丝可以做什么'],
 'zh-Hant': ['即將到來的行程', '查看大日曆', '已加入的粉絲可以做什麼'],
 es: ['Próximos eventos', 'Ver calendario', 'Lo que pueden hacer los fans que se unen'],
 id: ['Jadwal mendatang', 'Lihat kalender', 'Yang bisa dilakukan penggemar yang bergabung'],
 vi: ['Lịch sắp tới', 'Xem lịch', 'Fan đã tham gia có thể làm gì'],
 th: ['กำหนดการที่กำลังจะมาถึง', 'ดูปฏิทิน', 'สิ่งที่แฟนที่เข้าร่วมทำได้'],
 pt: ['Próximos eventos', 'Ver calendário', 'O que os fãs que entram podem fazer'],
 fr: ['Prochains événements', 'Voir le calendrier', 'Ce que peuvent faire les fans inscrits'],
 ru: ['Ближайшие события', 'Открыть календарь', 'Что могут вступившие фанаты'],
};
export function creatorHomeCardCopy(locale: AppLocale) {
 const [schedule, calendar, joinTitle] = copy[locale] ?? copy.en;
 return { schedule, calendar, joinTitle };
}
