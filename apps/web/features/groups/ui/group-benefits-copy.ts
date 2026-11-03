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
export function groupBenefitsCopy(locale:AppLocale){const [title,lucky,support,events,details,empty,history,creator]=labels[locale];return {title,lucky,support,events,details,empty,history,creator};}
