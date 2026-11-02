import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly string[]>={
 ko:['비밀방 입장 조건을 확인해요.','참여 일정과 내 티켓을 확인해요.','사진 인증과 현장 미션에 참여해요.','응모권 추첨과 캡슐을 만나보세요.'],
 en:['Check private-room entry requirements.','See event dates and your tickets.','Join photo and on-site missions.','Explore ticket draws and capsules.'],
 ja:['秘密ルームの入室条件を確認。','参加日程とチケットを確認。','写真認証や会場ミッションに参加。','抽選とカプセルをチェック。'],
 'zh-Hans':['查看私密房间的进入条件。','查看活动日程和门票。','参与照片验证及现场任务。','查看抽奖和扭蛋。'],
 'zh-Hant':['查看私密房間的進入條件。','查看活動日程和門票。','參與照片驗證及現場任務。','查看抽獎和扭蛋。'],
 es:['Consulta los requisitos de las salas privadas.','Consulta fechas y tus entradas.','Participa en misiones de fotos y presenciales.','Explora sorteos y cápsulas.'],
 id:['Lihat syarat masuk ruang privat.','Lihat jadwal acara dan tiketmu.','Ikuti misi foto dan di lokasi.','Jelajahi undian tiket dan kapsul.'],
 vi:['Xem điều kiện vào phòng riêng.','Xem lịch sự kiện và vé của bạn.','Tham gia nhiệm vụ ảnh và tại chỗ.','Khám phá quay thưởng và capsule.'],
 th:['ดูเงื่อนไขเข้าห้องส่วนตัว','ดูวันกิจกรรมและตั๋วของคุณ','ร่วมภารกิจภาพถ่ายและภารกิจหน้างาน','ดูการจับรางวัลและแคปซูล'],
 pt:['Confira os requisitos das salas privadas.','Veja datas dos eventos e seus ingressos.','Participe de missões com fotos e presenciais.','Explore sorteios e cápsulas.'],
 fr:['Consultez les conditions des salons privés.','Consultez les dates et vos billets.','Participez aux missions photo et sur place.','Découvrez les tirages et les capsules.'],
 ru:['Условия входа в закрытые комнаты.','Даты событий и ваши билеты.','Фотозадания и задания на месте.','Розыгрыши билетов и капсулы.']};
export const activityHubCopy=(locale:AppLocale)=>values[locale];
