import type { TranslatedMessage } from "../messages";

export const messages = {
  "dukjilPageTitle": {
    "ja": "{0} 出席チェック",
    "zh-Hans": "{0} 出勤打卡",
    "zh-Hant": "{0} 出勤打卡",
    "es": "Asistencia de {0}",
    "id": "Absen {0}",
    "vi": "Điểm danh {0}",
    "th": "เช็กชื่อ {0}",
    "pt": "Check-in de {0}",
    "fr": "Présence {0}",
    "ru": "Отметка: {0}"
  },
  "dukjilDayDone": {
    "ja": "{0}日目 完了",
    "zh-Hans": "第 {0} 天已完成",
    "zh-Hant": "第 {0} 天已完成",
    "es": "Día {0} hecho",
    "id": "Hari ke-{0} selesai",
    "vi": "Đã xong ngày {0}",
    "th": "วันที่ {0} เสร็จแล้ว",
    "pt": "Dia {0} concluído",
    "fr": "Jour {0} fait",
    "ru": "День {0} выполнен"
  },
  "dukjilStampCount": {
    "ja": "{0}個",
    "zh-Hans": "{0} 个",
    "zh-Hant": "{0} 個",
    "es": "{0}",
    "id": "{0}",
    "vi": "{0}",
    "th": "{0}",
    "pt": "{0}",
    "fr": "{0}",
    "ru": "{0}"
  },
  "missionTaskCheckin": {
    "ja": "今日出席します",
    "zh-Hans": "今天出勤",
    "zh-Hant": "今天出勤",
    "es": "Marca asistencia hoy",
    "id": "Absen hari ini",
    "vi": "Điểm danh hôm nay",
    "th": "เช็กชื่อวันนี้",
    "pt": "Faça check-in hoje",
    "fr": "Pointez aujourd'hui",
    "ru": "Отметьтесь сегодня"
  },
  "missionTaskPost": {
    "ja": "ファン掲示板に投稿します",
    "zh-Hans": "在粉丝板块发帖",
    "zh-Hant": "在粉絲版發文",
    "es": "Publica en el tablón de fans",
    "id": "Unggah tulisan di papan penggemar",
    "vi": "Đăng bài lên bảng fan",
    "th": "โพสต์ในบอร์ดแฟน",
    "pt": "Publique no mural de fãs",
    "fr": "Publiez sur le forum des fans",
    "ru": "Напишите пост на доске фанатов"
  },
  "missionTaskComment": {
    "ja": "ファン掲示板の投稿にコメントします",
    "zh-Hans": "评论粉丝板块的帖子",
    "zh-Hant": "留言回覆粉絲版貼文",
    "es": "Comenta una publicación del tablón",
    "id": "Komentari tulisan di papan penggemar",
    "vi": "Bình luận bài trên bảng fan",
    "th": "คอมเมนต์โพสต์ในบอร์ดแฟน",
    "pt": "Comente uma publicação do mural",
    "fr": "Commentez un message du forum",
    "ru": "Прокомментируйте пост на доске"
  },
  "missionTaskShare": {
    "ja": "友だちがパスポートのリンクを開くと加算されます", "zh-Hans": "好友打开你的护照链接后计入", "zh-Hant": "好友開啟你的護照連結後計入", "es": "Cuenta cuando un amigo abre tu enlace del pasaporte", "id": "Terhitung saat teman membuka tautan paspormu", "vi": "Được tính khi bạn bè mở liên kết hộ chiếu của bạn", "th": "นับเมื่อเพื่อนเปิดลิงก์พาสปอร์ตของคุณ", "pt": "Conta quando um amigo abre o link do seu passaporte", "fr": "Compte quand un ami ouvre le lien de votre passeport", "ru": "Засчитывается, когда друг открывает ссылку на ваш паспорт"
  },
  "missionTaskInvite": {
    "ja": "招待リンクで友だちを誘います",
    "zh-Hans": "用邀请链接带来好友",
    "zh-Hant": "用邀請連結帶來好友",
    "es": "Trae a un amigo con tu enlace",
    "id": "Ajak teman lewat tautan undangan",
    "vi": "Mời bạn qua liên kết mời",
    "th": "ชวนเพื่อนด้วยลิงก์เชิญ",
    "pt": "Traga um amigo com seu link",
    "fr": "Invitez un ami avec votre lien",
    "ru": "Пригласите друга по ссылке"
  },
  "missionTaskProof": {
    "ja": "条件を確認して認証を提出します",
    "zh-Hans": "确认条件并提交认证",
    "zh-Hant": "確認條件並提交認證",
    "es": "Revisa las condiciones y envía la prueba",
    "id": "Cek syarat lalu kirim bukti",
    "vi": "Xem điều kiện rồi gửi xác nhận",
    "th": "ดูเงื่อนไขแล้วส่งหลักฐาน",
    "pt": "Veja as condições e envie a prova",
    "fr": "Vérifiez les conditions et envoyez la preuve",
    "ru": "Проверьте условия и отправьте подтверждение"
  },
  "missionTaskQuiz": {
    "ja": "入国審査の問題に答えます",
    "zh-Hans": "回答入境审查问题",
    "zh-Hant": "回答入境審查問題",
    "es": "Responde la revisión de entrada",
    "id": "Jawab soal pemeriksaan masuk",
    "vi": "Trả lời câu hỏi kiểm tra nhập cảnh",
    "th": "ตอบคำถามตรวจคนเข้าเมือง",
    "pt": "Responda à revisão de entrada",
    "fr": "Répondez au contrôle d'entrée",
    "ru": "Ответьте на вопросы проверки"
  },
  "missionTaskSubscription": {
    "ja": "クリエイターのチャンネルを登録して認証します",
    "zh-Hans": "订阅创作者频道并认证",
    "zh-Hant": "訂閱創作者頻道並認證",
    "es": "Suscríbete al canal del creador y verifica",
    "id": "Langganan kanal kreator lalu verifikasi",
    "vi": "Đăng ký kênh của nhà sáng tạo rồi xác nhận",
    "th": "ติดตามช่องครีเอเตอร์แล้วยืนยัน",
    "pt": "Assine o canal do criador e verifique",
    "fr": "Abonnez-vous à la chaîne et validez",
    "ru": "Подпишитесь на канал автора и подтвердите"
  },
  "missionTaskSteady": {
    "ja": "{0}日連続で出席します",
    "zh-Hans": "连续出勤 {0} 天",
    "zh-Hant": "連續出勤 {0} 天",
    "es": "Marca asistencia {0} días seguidos",
    "id": "Absen {0} hari berturut-turut",
    "vi": "Điểm danh {0} ngày liên tiếp",
    "th": "เช็กชื่อติดต่อกัน {0} วัน",
    "pt": "Faça check-in {0} dias seguidos",
    "fr": "Pointez {0} jours de suite",
    "ru": "Отмечайтесь {0} дней подряд"
  },
  "missionTaskSteadyPlain": {
    "ja": "数日連続で出席します",
    "zh-Hans": "连续几天出勤",
    "zh-Hant": "連續幾天出勤",
    "es": "Marca asistencia varios días seguidos",
    "id": "Absen beberapa hari berturut-turut",
    "vi": "Điểm danh vài ngày liên tiếp",
    "th": "เช็กชื่อติดต่อกันหลายวัน",
    "pt": "Faça check-in vários dias seguidos",
    "fr": "Pointez plusieurs jours de suite",
    "ru": "Отмечайтесь несколько дней подряд"
  },
  "missionClaimHint": {
    "ja": "{0}マスすべて埋めるとハートがもらえます",
    "zh-Hans": "填满 {0} 格即可获得爱心",
    "zh-Hant": "填滿 {0} 格即可獲得愛心",
    "es": "Completa las {0} casillas para recibir un corazón",
    "id": "Isi semua {0} kotak untuk mendapat hati",
    "vi": "Điền đủ {0} ô để nhận trái tim",
    "th": "เติมครบ {0} ช่องเพื่อรับหัวใจ",
    "pt": "Preencha os {0} espaços para receber um coração",
    "fr": "Remplissez les {0} cases pour recevoir un cœur",
    "ru": "Заполните все {0} ячеек, чтобы получить сердце"
  },
  "missionsTitle": {
    "ja": "今日のミッション", "zh-Hans": "今日任务", "zh-Hant": "今日任務", "es": "Misiones de hoy", "id": "Misi hari ini", "vi": "Nhiệm vụ hôm nay", "th": "ภารกิจวันนี้", "pt": "Missões de hoje", "fr": "Missions du jour", "ru": "Задания на сегодня"
  },
  "missionsAllClear": {
    "ja": "すべて完了", "zh-Hans": "全部完成", "zh-Hant": "全部完成", "es": "Todo completado", "id": "Semua selesai", "vi": "Hoàn thành tất cả", "th": "สำเร็จทั้งหมด", "pt": "Tudo concluído", "fr": "Tout terminé", "ru": "Всё выполнено"
  },
  "missionDoneShort": {
    "ja": "完了", "zh-Hans": "完成", "zh-Hant": "完成", "es": "Hecho", "id": "Selesai", "vi": "Xong", "th": "เสร็จแล้ว", "pt": "Concluído", "fr": "Fait", "ru": "Готово"
  },
  "missionsTodayEarned": {
    "ja": "今日 +{0}P", "zh-Hans": "今日 +{0}P", "zh-Hant": "今日 +{0}P", "es": "Hoy +{0}P", "id": "Hari ini +{0}P", "vi": "Hôm nay +{0}P", "th": "วันนี้ +{0}P", "pt": "Hoje +{0}P", "fr": "Aujourd’hui +{0}P", "ru": "Сегодня +{0}P"
  },
  "checkinRewardDaily": {
    "ja": "毎日の出席", "zh-Hans": "每日打卡", "zh-Hant": "每日打卡", "es": "Asistencia diaria", "id": "Absen harian", "vi": "Điểm danh hằng ngày", "th": "เช็กชื่อรายวัน", "pt": "Check-in diário", "fr": "Présence quotidienne", "ru": "Ежедневная отметка"
  },
  "checkinRewardBonus": {
    "ja": "{0}日目ボーナス", "zh-Hans": "第 {0} 天奖励", "zh-Hant": "第 {0} 天獎勵", "es": "Bono del día {0}", "id": "Bonus hari ke-{0}", "vi": "Thưởng ngày {0}", "th": "โบนัสวันที่ {0}", "pt": "Bônus do dia {0}", "fr": "Bonus du jour {0}", "ru": "Бонус дня {0}"
  },
  "gaugeCount": {
    "ja": "{0} / {1}人",
    "zh-Hans": "{0} / {1} 人",
    "zh-Hant": "{0} / {1} 人",
    "es": "{0} / {1}",
    "id": "{0} / {1}",
    "vi": "{0} / {1}",
    "th": "{0} / {1}",
    "pt": "{0} / {1}",
    "fr": "{0} / {1}",
    "ru": "{0} / {1}"
  }
} satisfies Record<string, TranslatedMessage>;
