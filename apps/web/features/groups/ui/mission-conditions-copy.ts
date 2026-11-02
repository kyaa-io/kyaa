import type{AppLocale}from'@/i18n/locales';
const rows:Record<AppLocale,readonly [string,string,string,string,string,string,string,string,string]>={
 ko:['참여 전에 확인해 주세요','참여 대상','이 모임에 가입한 회원','제출할 내용','포인트와 인정 횟수','지급 시점','운영 정책 확인 필요 · 미확정','참여 인정 및 검토 후 지급 · 세부 기준 확인 필요','인증 제출하기'],
 en:['Before you participate','Eligible participants','Members of this group','What to submit','Points and recognition count','When points are credited','Policy confirmation required · Unconfirmed','After participation recognition and review · Details require confirmation','Submit verification'],
 ja:['参加前にご確認ください','参加対象','このグループに加入したメンバー','提出する内容','ポイントと認定回数','付与時期','運営方針の確認が必要・未確定','参加認定と審査後に付与・詳細基準の確認が必要','認証を提出'],
 'zh-Hans':['参与前请确认','参与对象','已加入本群组的成员','提交内容','积分与认可次数','发放时间','需确认运营政策 · 尚未确定','参与认可及审核后发放 · 具体标准需确认','提交认证'],
 'zh-Hant':['參與前請確認','參與對象','已加入本群組的成員','提交內容','點數與認可次數','發放時間','需確認營運政策 · 尚未確定','參與認可及審核後發放 · 具體標準需確認','提交認證'],
 es:['Antes de participar','Participantes elegibles','Miembros de este grupo','Qué enviar','Puntos y número de reconocimientos','Momento del abono','Política pendiente de confirmar','Tras reconocer y revisar la participación · Criterios pendientes de confirmar','Enviar verificación'],
 id:['Sebelum berpartisipasi','Peserta yang memenuhi syarat','Anggota grup ini','Konten yang dikirim','Poin dan jumlah pengakuan','Waktu pemberian poin','Kebijakan perlu dikonfirmasi · Belum pasti','Setelah pengakuan dan peninjauan partisipasi · Rincian perlu dikonfirmasi','Kirim verifikasi'],
 vi:['Trước khi tham gia','Đối tượng tham gia','Thành viên đã tham gia nhóm này','Nội dung cần gửi','Điểm và số lần công nhận','Thời điểm cộng điểm','Cần xác nhận chính sách · Chưa xác định','Sau khi công nhận và xét duyệt tham gia · Cần xác nhận tiêu chí chi tiết','Gửi xác minh'],
 th:['โปรดตรวจสอบก่อนเข้าร่วม','ผู้มีสิทธิ์เข้าร่วม','สมาชิกที่เข้าร่วมกลุ่มนี้','เนื้อหาที่ต้องส่ง','คะแนนและจำนวนครั้งที่รับรอง','เวลาที่ให้คะแนน','ต้องยืนยันนโยบาย · ยังไม่ยืนยัน','หลังรับรองและตรวจสอบการเข้าร่วม · ต้องยืนยันรายละเอียด','ส่งการยืนยัน'],
 pt:['Antes de participar','Participantes elegíveis','Membros deste grupo','O que enviar','Pontos e número de reconhecimentos','Momento do crédito','Política por confirmar · Não confirmado','Após reconhecimento e análise da participação · Detalhes por confirmar','Enviar verificação'],
 fr:['Avant de participer','Participants éligibles','Membres de ce groupe','Contenu à envoyer','Points et nombre de reconnaissances','Moment du crédit','Politique à confirmer · Non confirmé','Après reconnaissance et examen de la participation · Détails à confirmer','Envoyer la vérification'],
 ru:['Перед участием','Кто может участвовать','Участники этой группы','Что нужно отправить','Баллы и число подтверждений','Время начисления','Правила требуют подтверждения · Не определено','После подтверждения и проверки участия · Подробности требуют уточнения','Отправить подтверждение'],
};
export function missionConditionsCopy(locale:AppLocale){const [before,audience,audienceValue,content,reward,timing,unconfirmed,timingValue,submit]=rows[locale];return{before,audience,audienceValue,content,reward,timing,unconfirmed,timingValue,submit};}
