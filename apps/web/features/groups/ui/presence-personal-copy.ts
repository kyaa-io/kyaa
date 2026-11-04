import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly[string,string]>={
 ko:['접속 상태와 오늘 방문 여부를 팬에게 공개해요','팬들에게 보이는 모습'],
 en:['Share your online status and today’s visit with fans','What fans see'],
 ja:['接続状況と今日の訪問をファンに公開します','ファンへの表示'],
 'zh-Hans':['向粉丝公开在线状态和今日访问','粉丝看到的样子'],
 'zh-Hant':['向粉絲公開上線狀態與今日造訪','粉絲看到的樣子'],
 es:['Comparte tu estado y tu visita de hoy con tus fans','Lo que ven tus fans'],
 id:['Bagikan status online dan kunjungan hari ini kepada penggemar','Tampilan bagi penggemar'],
 vi:['Chia sẻ trạng thái trực tuyến và lượt ghé hôm nay với người hâm mộ','Người hâm mộ nhìn thấy'],
 th:['แชร์สถานะออนไลน์และการเข้าชมวันนี้ให้แฟนเห็น','สิ่งที่แฟนเห็น'],
 pt:['Compartilhe seu estado online e a visita de hoje com os fãs','O que os fãs veem'],
 fr:['Partagez votre statut et votre visite du jour avec les fans','Ce que voient les fans'],
 ru:['Показывайте статус онлайн и сегодняшний визит фанатам','Что видят фанаты'],
};
export const presencePersonalCopy=(locale:AppLocale)=>values[locale];
