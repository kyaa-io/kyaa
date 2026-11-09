import type {AppLocale} from '@/i18n/locales';
import {messages as stanMessages} from '@/i18n/catalogs/features__groups__ui__group-benefits-copy';
/** D1: the 덕질 tab name comes from the key `navStan` (source-messages.json and its catalog); change English "Stan" there. */
const stan:Record<AppLocale,string>={ko:'덕질',en:'Stan',...stanMessages.navStan};
const labels:Record<AppLocale,readonly [string,string,string,string,string,string,string]>={
 ko:['덕질','럭키드로우','포인트 이벤트','자세히 보기','아직 공개된 항목이 없어요.','참여 내역','내역'],
 en:['Stan','Lucky draws','Point events','View details','Nothing published yet.','Participation history','History'],
 ja:['推し活','ラッキードロー','ポイントイベント','詳細を見る','公開された項目はまだありません。','参加履歴','履歴'],
 'zh-Hans':['追星','幸运抽奖','积分活动','查看详情','暂无已发布内容。','参与记录','记录'],
 'zh-Hant':['追星','幸運抽獎','點數活動','查看詳情','尚無已發布內容。','參與紀錄','紀錄'],
 es:['Stan','Sorteos','Eventos de puntos','Ver detalles','Aún no hay publicaciones.','Historial de participación','Historial'],
 id:['Stan','Undian berhadiah','Acara poin','Lihat detail','Belum ada yang dipublikasikan.','Riwayat partisipasi','Riwayat'],
 vi:['Stan','Rút thăm may mắn','Sự kiện tích điểm','Xem chi tiết','Chưa có nội dung được công bố.','Lịch sử tham gia','Lịch sử'],
 th:['แฟนคลับ','ลุ้นรางวัล','กิจกรรมสะสมแต้ม','ดูรายละเอียด','ยังไม่มีรายการเผยแพร่','ประวัติการเข้าร่วม','ประวัติ'],
 pt:['Stan','Sorteios','Eventos de pontos','Ver detalhes','Ainda não há publicações.','Histórico de participação','Histórico'],
 fr:['Stan','Tirages au sort','Événements à points','Voir les détails','Aucune publication pour le moment.','Historique de participation','Historique'],
 ru:['Стэн','Розыгрыши','События с баллами','Подробнее','Публикаций пока нет.','История участия','История']
};
export function groupBenefitsCopy(locale:AppLocale){const [,lucky,events,details,empty,history,historyLink]=labels[locale];return {title:stan[locale],lucky,events,details,empty,history,historyLink,listing:eventLists[locale],soon:comingSoon[locale]};}

const raffleStates:Record<AppLocale,readonly [string,string]>={ko:['준비 중','응모 접수 중'],en:['Preparing','Open for entries'],ja:['準備中','応募受付中'],'zh-Hans':['准备中','可报名'],'zh-Hant':['準備中','可報名'],es:['En preparación','Inscripciones abiertas'],id:['Dalam persiapan','Pendaftaran dibuka'],vi:['Đang chuẩn bị','Đang nhận đăng ký'],th:['กำลังเตรียม','เปิดรับสมัคร'],pt:['Em preparação','Inscrições abertas'],fr:['En préparation','Inscriptions ouvertes'],ru:['Подготовка','Приём заявок открыт']};
export function benefitsRaffleState(locale:AppLocale,status:'preparing'|'open'){return raffleStates[locale][status==='preparing'?0:1];}

const eventLists:Record<AppLocale,string>={ko:'이벤트',en:'Events',ja:'イベント','zh-Hans':'活动','zh-Hant':'活動',es:'Eventos',id:'Acara',vi:'Sự kiện',th:'กิจกรรม',pt:'Eventos',fr:'Événements',ru:'События'};

const comingSoon:Record<AppLocale,string>={ko:'곧 안내해 드릴게요',en:'Details coming soon',ja:'近日ご案内します','zh-Hans':'即将公布','zh-Hant':'即將公布',es:'Más información próximamente',id:'Info segera hadir',vi:'Sẽ sớm thông báo',th:'แจ้งรายละเอียดเร็ว ๆ นี้',pt:'Mais informações em breve',fr:'Plus d’informations bientôt',ru:'Подробности скоро'};
