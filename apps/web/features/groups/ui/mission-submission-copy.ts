import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string,string,string]>={
 ko:['인증 제출 내역','제출 내용','포인트 상태','아직 적립되지 않았어요.','내용 보완하기'],
 en:['Verification submissions','Submitted content','Point status','No points have been credited yet.','Update submission'],
 ja:['認証提出履歴','提出内容','ポイント状況','まだポイントは付与されていません。','内容を修正する'],
 'zh-Hans':['认证提交记录','提交内容','积分状态','尚未获得积分。','补充内容'],
 'zh-Hant':['認證提交紀錄','提交內容','點數狀態','尚未獲得點數。','補充內容'],
 es:['Verificaciones enviadas','Contenido enviado','Estado de puntos','Aún no se han abonado puntos.','Actualizar contenido'],
 id:['Riwayat pengajuan verifikasi','Konten yang dikirim','Status poin','Poin belum dikreditkan.','Perbarui pengajuan'],
 vi:['Lịch sử gửi xác minh','Nội dung đã gửi','Trạng thái điểm','Chưa được cộng điểm.','Bổ sung nội dung'],
 th:['ประวัติการส่งยืนยัน','เนื้อหาที่ส่ง','สถานะคะแนน','ยังไม่ได้รับคะแนน','แก้ไขเนื้อหา'],
 pt:['Verificações enviadas','Conteúdo enviado','Estado dos pontos','Ainda não foram creditados pontos.','Atualizar conteúdo'],
 fr:['Vérifications envoyées','Contenu envoyé','État des points','Aucun point n’a encore été crédité.','Compléter le contenu'],
 ru:['История отправленных подтверждений','Отправленный материал','Статус баллов','Баллы ещё не начислены.','Дополнить материал'],
};
const navigation:Record<AppLocale,readonly [string,string]>={ko:['덕질 참여 조건','내 제출 내역'],en:['Mission requirements','My submissions'],ja:['ミッション参加条件','自分の提出履歴'],'zh-Hans':['任务参与条件','我的提交记录'],'zh-Hant':['任務參與條件','我的提交紀錄'],es:['Requisitos de la misión','Mis envíos'],id:['Syarat partisipasi misi','Pengajuan saya'],vi:['Điều kiện nhiệm vụ','Nội dung tôi đã gửi'],th:['เงื่อนไขภารกิจ','รายการที่ฉันส่ง'],pt:['Requisitos da missão','Meus envios'],fr:['Conditions de la mission','Mes envois'],ru:['Условия участия','Мои отправленные материалы']};
const earnings:Record<AppLocale,string>={ko:'적립 내역 확인',en:'View earnings history',ja:'獲得履歴を確認','zh-Hans':'查看积分记录','zh-Hant':'查看點數紀錄',es:'Ver historial de recompensas',id:'Lihat riwayat perolehan',vi:'Xem lịch sử tích điểm',th:'ดูประวัติการรับคะแนน',pt:'Ver histórico de recompensas',fr:'Voir l’historique des récompenses',ru:'Посмотреть историю начислений'};
const answered:Record<AppLocale,string>={ko:'같은 설문에 응답한 기록이 있어요.',en:'You have already responded to this survey.',ja:'このアンケートにはすでに回答しています。','zh-Hans':'你已经回答过这份问卷。','zh-Hant':'你已經回答過這份問卷。',es:'Ya has respondido a esta encuesta.',id:'Anda sudah menjawab survei ini.',vi:'Bạn đã trả lời khảo sát này.',th:'คุณตอบแบบสำรวจนี้แล้ว',pt:'Você já respondeu a esta pesquisa.',fr:'Vous avez déjà répondu à ce questionnaire.',ru:'Вы уже ответили на этот опрос.'};
export function missionSubmissionCopy(locale:AppLocale){const [title,body,points,pending,revise]=copy[locale];return{title,body,points,pending,revise,conditions:navigation[locale][0],own:navigation[locale][1],earnings:earnings[locale],answered:answered[locale]};}
