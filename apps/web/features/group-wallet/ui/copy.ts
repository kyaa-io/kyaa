import type { AppLocale } from "@/i18n/locales";
const keys = ["wallet","points","tickets","exchange","quantity","cost","remaining","attendance","checkIn","checkedIn","bonus","history","passport","stamps","error","retry","loading","login","recover","pending","success","empty"] as const;
const copy = {
 ko: ["포인트·응모권","포인트","응모권","교환하기","교환 수량","필요 포인트","교환 후 포인트","출석체크","출석하고 포인트 받기","오늘 출석 완료","7일 연속 출석하면 보너스 포인트","적립·사용 내역","내 패스포트","모은 스탬프 보기","요청을 완료하지 못했어요.","다시 시도","불러오는 중","로그인","처리 결과 확인","처리 중인 요청이 있어요. 결과를 먼저 확인해 주세요.","완료했어요.","아직 내역이 없어요."],
 en: ["Points & tickets","Points","Tickets","Exchange","Quantity","Points required","Points remaining","Check-in","Check in for points","Checked in today","Bonus points every 7 days in a row","Transaction history","My Passport","View stamps","Couldn’t complete the request.","Try again","Loading","Sign in","Check result","A request is pending. Check its result first.","Completed.","No transactions yet."],
 ja: ["ポイント・応募券","ポイント","応募券","交換する","数量","必要ポイント","交換後のポイント","出席","出席してポイント獲得","本日の出席完了","7日連続出席ごとにボーナスポイント","獲得・利用履歴","マイパスポート","スタンプを見る","処理できませんでした。","再試行","読み込み中","ログイン","結果を確認","処理中の申請があります。先に結果を確認してください。","完了しました。","履歴はありません。"],
 "zh-Hans": ["积分和抽奖券","积分","抽奖券","兑换","数量","所需积分","兑换后积分","签到","签到领取积分","今日已签到","每连续签到7天可获额外积分","收支记录","我的护照","查看印章","未能完成请求。","重试","加载中","登录","查看结果","有待处理的请求，请先查看结果。","已完成。","暂无记录。"],
 "zh-Hant": ["點數與抽獎券","點數","抽獎券","兌換","數量","所需點數","兌換後點數","簽到","簽到領取點數","今日已簽到","每連續簽到7天可獲額外點數","收支紀錄","我的護照","查看印章","無法完成請求。","重試","載入中","登入","查看結果","有待處理的請求，請先查看結果。","已完成。","暫無紀錄。"],
 es: ["Puntos y boletos","Puntos","Boletos","Canjear","Cantidad","Puntos necesarios","Puntos restantes","Asistencia","Registra tu asistencia y gana puntos","Asistencia registrada","Puntos extra cada 7 días seguidos","Historial","Mi pasaporte","Ver sellos","No se pudo completar.","Reintentar","Cargando","Iniciar sesión","Consultar resultado","Hay una solicitud pendiente. Consulta su resultado.","Completado.","Aún no hay movimientos."],
 id: ["Poin & tiket","Poin","Tiket","Tukar","Jumlah","Poin diperlukan","Sisa poin","Absensi","Check-in untuk dapat poin","Sudah absen hari ini","Poin bonus tiap 7 hari berturut-turut","Riwayat transaksi","Paspor saya","Lihat stempel","Permintaan gagal diselesaikan.","Coba lagi","Memuat","Masuk","Periksa hasil","Ada permintaan tertunda. Periksa hasilnya dahulu.","Selesai.","Belum ada transaksi."],
 vi: ["Điểm và vé","Điểm","Vé","Đổi","Số lượng","Điểm cần","Điểm còn lại","Điểm danh","Điểm danh để nhận điểm","Đã điểm danh hôm nay","Điểm thưởng mỗi 7 ngày liên tiếp","Lịch sử giao dịch","Hộ chiếu của tôi","Xem dấu","Không thể hoàn tất yêu cầu.","Thử lại","Đang tải","Đăng nhập","Kiểm tra kết quả","Có yêu cầu đang chờ. Hãy kiểm tra kết quả trước.","Hoàn tất.","Chưa có giao dịch."],
 th: ["แต้มและตั๋ว","แต้ม","ตั๋ว","แลก","จำนวน","แต้มที่ใช้","แต้มคงเหลือ","เช็กอิน","เช็กอินเพื่อรับแต้ม","เช็กอินวันนี้แล้ว","แต้มโบนัสทุก 7 วันติดต่อกัน","ประวัติรายการ","พาสปอร์ตของฉัน","ดูตราประทับ","ไม่สามารถดำเนินการได้","ลองอีกครั้ง","กำลังโหลด","เข้าสู่ระบบ","ตรวจสอบผล","มีคำขอรอดำเนินการ โปรดตรวจสอบผลก่อน","เสร็จแล้ว","ยังไม่มีรายการ"],
 pt: ["Pontos e bilhetes","Pontos","Bilhetes","Trocar","Quantidade","Pontos necessários","Pontos restantes","Presença","Faça check-in e ganhe pontos","Presença registada","Pontos extras a cada 7 dias seguidos","Histórico","Meu passaporte","Ver carimbos","Não foi possível concluir.","Tentar novamente","A carregar","Entrar","Consultar resultado","Há um pedido pendente. Consulte o resultado primeiro.","Concluído.","Ainda não há transações."],
 fr: ["Points et billets","Points","Billets","Échanger","Quantité","Points nécessaires","Points restants","Présence","Pointez pour gagner des points","Présence validée","Points bonus tous les 7 jours consécutifs","Historique","Mon passeport","Voir les tampons","La demande n’a pas abouti.","Réessayer","Chargement","Se connecter","Vérifier le résultat","Une demande est en attente. Vérifiez son résultat.","Terminé.","Aucune transaction."],
 ru: ["Баллы и билеты","Баллы","Билеты","Обменять","Количество","Нужно баллов","Остаток баллов","Отметка","Отметьтесь и получите баллы","Сегодня отмечено","Бонусные баллы за каждые 7 дней подряд","История операций","Мой паспорт","Посмотреть штампы","Не удалось завершить запрос.","Повторить","Загрузка","Войти","Проверить результат","Есть ожидающий запрос. Сначала проверьте результат.","Готово.","Операций пока нет."],
} satisfies Record<AppLocale, readonly string[]>;
export function walletCopy(locale: AppLocale) { return Object.fromEntries(keys.map((key, i) => [key, copy[locale][i]])) as Record<typeof keys[number], string>; }

export function walletStartLabel(locale:AppLocale,date:string) {
 const labels:Record<AppLocale,string>={ko:"{date}부터 출석",en:"Check-in starts {date}",ja:"{date}から出席",'zh-Hans':"{date}开始签到",'zh-Hant':"{date}開始簽到",es:"Asistencia desde {date}",id:"Absensi mulai {date}",vi:"Điểm danh từ {date}",th:"เริ่มเช็กอิน {date}",pt:"Presença a partir de {date}",fr:"Présence à partir du {date}",ru:"Отметки с {date}"};
 return labels[locale].replace('{date}',new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(date+'T00:00:00+09:00')));
}

export function attendanceStreakLabel(locale:AppLocale,days:number){
 const labels:Record<AppLocale,string>={ko:'{n}일 연속 출석',en:'{n}-day check-in streak',ja:'{n}日連続出席','zh-Hans':'连续签到{n}天','zh-Hant':'連續簽到{n}天',es:'{n} días consecutivos',id:'Absen {n} hari berturut-turut',vi:'Điểm danh {n} ngày liên tiếp',th:'เช็กอินต่อเนื่อง {n} วัน',pt:'{n} dias consecutivos',fr:'{n} jours consécutifs',ru:'Отметки {n} дней подряд'};
 return labels[locale].replace('{n}',days.toLocaleString(locale));
}

/** ? 도움말 문구(WALLET-HELP-IMPL). 하트는 지갑 자산이 아니므로 포인트 문구에서 하트 경로는 약속하지 않는다. */
export function walletHelpCopy(locale:AppLocale){
 const v:Record<AppLocale,readonly[string,string,string]>={
  ko:['도움말','출석체크·모임 덕질·댓글 같은 활동으로 모아요. 광고를 본 뒤 100P를 응모권 1장으로 바꿀 수 있어요.','크리에이터·모임 럭키드로우에 응모하거나 캡슐을 열 때 써요.'],
  en:['Help','Earn them through activities such as check-ins, group missions and comments. After watching an ad, 100P can be exchanged for 1 raffle ticket.','Use them to enter creator and group raffles or open capsules.'],
  ja:['ヘルプ','出席チェック・グループミッション・コメントなどの活動で貯まります。広告を見たあと、100Pで応募券1枚と交換できます。','クリエイター・グループのラッキードローへの応募やカプセルを開けるときに使います。'],
  'zh-Hans':['帮助','通过签到、小组任务、评论等活动获得。观看广告后,100P可兑换1张抽奖券。','用于报名创作者和小组的抽奖或开启胶囊。'],
  'zh-Hant':['說明','透過簽到、社團任務、留言等活動獲得。觀看廣告後,100P可兌換1張抽獎券。','用於報名創作者和社團的抽獎或開啟膠囊。'],
  es:['Ayuda','Se consiguen con actividades como asistencia, misiones del grupo y comentarios. Tras ver un anuncio, 100P se canjean por 1 boleto de sorteo.','Sirven para participar en sorteos de creadores y grupos o abrir cápsulas.'],
  id:['Bantuan','Didapat dari aktivitas seperti absensi, misi grup, dan komentar. Setelah menonton iklan, 100P dapat ditukar dengan 1 tiket undian.','Dipakai untuk ikut undian kreator dan grup atau membuka kapsul.'],
  vi:['Trợ giúp','Nhận qua các hoạt động như điểm danh, nhiệm vụ nhóm và bình luận. Sau khi xem quảng cáo, 100P đổi được 1 vé dự thưởng.','Dùng để tham gia bốc thăm của nhà sáng tạo và nhóm hoặc mở capsule.'],
  th:['วิธีใช้','สะสมได้จากกิจกรรมอย่างเช็กอิน ภารกิจกลุ่ม และคอมเมนต์ หลังดูโฆษณาแล้ว 100P แลกบัตรลุ้นรางวัลได้ 1 ใบ','ใช้ลุ้นรางวัลของครีเอเตอร์และกลุ่มหรือเปิดแคปซูล'],
  pt:['Ajuda','Ganhe com atividades como presença, missões do grupo e comentários. Depois de ver um anúncio, 100P valem 1 bilhete de sorteio.','Use para entrar em sorteios de criadores e grupos ou abrir cápsulas.'],
  fr:['Aide','Gagnez-les par des activités comme la présence, les missions du groupe et les commentaires. Après une publicité, 100P s’échangent contre 1 ticket de tirage.','Servent à participer aux tirages des créateurs et des groupes ou à ouvrir des capsules.'],
  ru:['Справка','Начисляются за активность: отметки, задания группы, комментарии. После просмотра рекламы 100P можно обменять на 1 билет розыгрыша.','Нужны для участия в розыгрышах авторов и групп и открытия капсул.']
 };
 const [label,points,tickets]=v[locale];return {label,points,tickets};
}
/** Singular ticket noun for the locales whose plural differs; others reuse `tickets`. */
export const ticketSingular: Partial<Record<AppLocale, string>> = { en: 'Ticket', es: 'Boleto', fr: 'Billet', pt: 'Bilhete', ru: 'Билет' };
