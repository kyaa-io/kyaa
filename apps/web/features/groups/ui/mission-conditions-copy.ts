import type{AppLocale}from'@/i18n/locales';
const rows:Record<AppLocale,readonly [string,string,string,string,string,string,string,string]>={
 ko:['참여 전에 확인해 주세요','참여 대상','이 모임에 가입한 팬','제출할 내용','포인트와 인정 횟수','지급 시점','참여 인정 및 검토 후 지급','인증 제출하기'],
 en:['Before you participate','Eligible participants','Fans of this group','What to submit','Points and recognition count','When points are credited','After participation recognition and review','Submit verification'],
 ja:['参加前にご確認ください','参加対象','このグループに加入したファン','提出する内容','ポイントと認定回数','付与時期','参加認定と審査後に付与','認証を提出'],
 'zh-Hans':['参与前请确认','参与对象','已加入本群组的粉丝','提交内容','积分与认可次数','发放时间','参与认可及审核后发放','提交认证'],
 'zh-Hant':['參與前請確認','參與對象','已加入本群組的粉絲','提交內容','點數與認可次數','發放時間','參與認可及審核後發放','提交認證'],
 es:['Antes de participar','Participantes elegibles','Fans de este grupo','Qué enviar','Puntos y número de reconocimientos','Momento del abono','Tras reconocer y revisar la participación','Enviar verificación'],
 id:['Sebelum berpartisipasi','Peserta yang memenuhi syarat','Penggemar grup ini','Konten yang dikirim','Poin dan jumlah pengakuan','Waktu pemberian poin','Setelah pengakuan dan peninjauan partisipasi','Kirim verifikasi'],
 vi:['Trước khi tham gia','Đối tượng tham gia','Fan đã tham gia nhóm này','Nội dung cần gửi','Điểm và số lần công nhận','Thời điểm cộng điểm','Sau khi công nhận và xét duyệt tham gia','Gửi xác minh'],
 th:['โปรดตรวจสอบก่อนเข้าร่วม','ผู้มีสิทธิ์เข้าร่วม','แฟนที่เข้าร่วมกลุ่มนี้','เนื้อหาที่ต้องส่ง','คะแนนและจำนวนครั้งที่รับรอง','เวลาที่ให้คะแนน','หลังรับรองและตรวจสอบการเข้าร่วม','ส่งการยืนยัน'],
 pt:['Antes de participar','Participantes elegíveis','Fãs deste grupo','O que enviar','Pontos e número de reconhecimentos','Momento do crédito','Após reconhecimento e análise da participação','Enviar verificação'],
 fr:['Avant de participer','Participants éligibles','Fans de ce groupe','Contenu à envoyer','Points et nombre de reconnaissances','Moment du crédit','Après reconnaissance et examen de la participation','Envoyer la vérification'],
 ru:['Перед участием','Кто может участвовать','Фанаты этой группы','Что нужно отправить','Баллы и число подтверждений','Время начисления','После подтверждения и проверки участия','Отправить подтверждение'],
};
export function missionConditionsCopy(locale:AppLocale){const [before,audience,audienceValue,content,reward,timing,timingValue,submit]=rows[locale];return{before,audience,audienceValue,content,reward,timing,timingValue,submit};}
