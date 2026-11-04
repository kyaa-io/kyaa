import type {AppLocale} from '@/i18n/locales';
const labels:Record<AppLocale,readonly [string,string,string,string,string,string,string,string]>={
 ko:['덕질','럭키드로우','최애 응원','포인트 이벤트','자세히 보기','아직 공개된 항목이 없어요.','참여 내역','응원할 크리에이터'],
 en:['Fan activities','Lucky draws','Support your favorite','Point events','View details','Nothing published yet.','Participation history','Creator to support'],
 ja:['推し活','ラッキードロー','推しを応援','ポイントイベント','詳細を見る','公開された項目はまだありません。','参加履歴','応援するクリエイター'],
 'zh-Hans':['追星','幸运抽奖','支持最爱','积分活动','查看详情','暂无已发布内容。','参与记录','支持的创作者'],
 'zh-Hant':['追星','幸運抽獎','支持最愛','點數活動','查看詳情','尚無已發布內容。','參與紀錄','支持的創作者'],
 es:['Actividades de fans','Sorteos','Apoya a tu favorito','Eventos de puntos','Ver detalles','Aún no hay publicaciones.','Historial de participación','Creador a apoyar'],
 id:['Aktivitas penggemar','Undian berhadiah','Dukung favoritmu','Acara poin','Lihat detail','Belum ada yang dipublikasikan.','Riwayat partisipasi','Kreator yang didukung'],
 vi:['Hoạt động người hâm mộ','Rút thăm may mắn','Ủng hộ người bạn yêu thích','Sự kiện tích điểm','Xem chi tiết','Chưa có nội dung được công bố.','Lịch sử tham gia','Nhà sáng tạo muốn ủng hộ'],
 th:['กิจกรรมแฟนคลับ','ลุ้นรางวัล','สนับสนุนคนโปรด','กิจกรรมสะสมแต้ม','ดูรายละเอียด','ยังไม่มีรายการเผยแพร่','ประวัติการเข้าร่วม','ครีเอเตอร์ที่ต้องการสนับสนุน'],
 pt:['Atividades de fãs','Sorteios','Apoie seu favorito','Eventos de pontos','Ver detalhes','Ainda não há publicações.','Histórico de participação','Criador a apoiar'],
 fr:['Activités de fans','Tirages au sort','Soutenir votre favori','Événements à points','Voir les détails','Aucune publication pour le moment.','Historique de participation','Créateur à soutenir'],
 ru:['Фан-активности','Розыгрыши','Поддержите любимого автора','События с баллами','Подробнее','Публикаций пока нет.','История участия','Автор для поддержки']
};
export function groupBenefitsCopy(locale:AppLocale){const [title,lucky,support,events,details,empty,history,creator]=labels[locale];return {title,lucky,support,events,details,empty,history,creator,listing:eventLists[locale],soon:comingSoon[locale]};}

const raffleStates:Record<AppLocale,readonly [string,string]>={ko:['준비 중','응모 접수 중'],en:['Preparing','Open for entries'],ja:['準備中','応募受付中'],'zh-Hans':['准备中','可报名'],'zh-Hant':['準備中','可報名'],es:['En preparación','Inscripciones abiertas'],id:['Dalam persiapan','Pendaftaran dibuka'],vi:['Đang chuẩn bị','Đang nhận đăng ký'],th:['กำลังเตรียม','เปิดรับสมัคร'],pt:['Em preparação','Inscrições abertas'],fr:['En préparation','Inscriptions ouvertes'],ru:['Подготовка','Приём заявок открыт']};
export function benefitsRaffleState(locale:AppLocale,status:'preparing'|'open'){return raffleStates[locale][status==='preparing'?0:1];}

const eventLists:Record<AppLocale,string>={ko:'이벤트',en:'Events',ja:'イベント','zh-Hans':'活动','zh-Hant':'活動',es:'Eventos',id:'Acara',vi:'Sự kiện',th:'กิจกรรม',pt:'Eventos',fr:'Événements',ru:'События'};

const comingSoon:Record<AppLocale,string>={ko:'곧 안내해 드릴게요',en:'Details coming soon',ja:'近日ご案内します','zh-Hans':'即将公布','zh-Hant':'即將公布',es:'Más información próximamente',id:'Info segera hadir',vi:'Sẽ sớm thông báo',th:'แจ้งรายละเอียดเร็ว ๆ นี้',pt:'Mais informações em breve',fr:'Plus d’informations bientôt',ru:'Подробности скоро'};
