import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string,string,string,string,string,string,string,string]>={
ko:['접수한 신고','신고 처리 결과','신고 내역에서 최종 결과와 처리 사유를 확인하세요.','접수 완료','검토 중','조치 요청','처리 완료','신고 내용','처리 사유','대상 글 확인'],
en:['My reports','Report result','Check the final result and reason in your report history.','Received','Under review','Action requested','Resolved','Report reason','Resolution reason','View reported content'],
ja:['送信した通報','通報の処理結果','通報履歴で最終結果と処理理由を確認してください。','受付済み','確認中','対応依頼','処理済み','通報内容','処理理由','対象を確認'],
'zh-Hans':['我的举报','举报处理结果','请在举报记录中查看最终结果及处理原因。','已受理','审核中','已请求处理','已处理','举报内容','处理原因','查看举报对象'],
'zh-Hant':['我的檢舉','檢舉處理結果','請在檢舉紀錄查看最終結果及處理原因。','已受理','審核中','已請求處理','已處理','檢舉內容','處理原因','查看檢舉對象'],
es:['Mis denuncias','Resultado de la denuncia','Consulta el resultado y el motivo en el historial de denuncias.','Recibida','En revisión','Acción solicitada','Resuelta','Motivo de la denuncia','Motivo de la resolución','Ver contenido denunciado'],
id:['Laporan saya','Hasil laporan','Lihat hasil akhir dan alasannya di riwayat laporan.','Diterima','Ditinjau','Tindakan diminta','Selesai','Alasan laporan','Alasan penyelesaian','Lihat konten yang dilaporkan'],
vi:['Báo cáo của tôi','Kết quả báo cáo','Xem kết quả cuối cùng và lý do xử lý trong lịch sử báo cáo.','Đã tiếp nhận','Đang xem xét','Đã yêu cầu xử lý','Đã xử lý','Lý do báo cáo','Lý do xử lý','Xem nội dung bị báo cáo'],
th:['รายงานของฉัน','ผลการรายงาน','ดูผลสรุปและเหตุผลการดำเนินการในประวัติรายงาน','รับเรื่องแล้ว','กำลังตรวจสอบ','ขอให้ดำเนินการ','ดำเนินการแล้ว','เหตุผลที่รายงาน','เหตุผลการดำเนินการ','ดูเนื้อหาที่รายงาน'],
pt:['Minhas denúncias','Resultado da denúncia','Veja o resultado final e o motivo no histórico de denúncias.','Recebida','Em análise','Ação solicitada','Resolvida','Motivo da denúncia','Motivo da resolução','Ver conteúdo denunciado'],
fr:['Mes signalements','Résultat du signalement','Consultez le résultat final et le motif dans votre historique.','Reçu','En cours d’examen','Action demandée','Traité','Motif du signalement','Motif du traitement','Voir le contenu signalé'],
ru:['Мои жалобы','Результат жалобы','Проверьте итог и причину решения в истории жалоб.','Получено','На рассмотрении','Запрошены меры','Рассмотрено','Причина жалобы','Причина решения','Открыть материал'],
};
export const groupOwnReportsCopy=(locale:AppLocale)=>copy[locale];
