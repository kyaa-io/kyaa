import type { AppLocale } from "@/i18n/locales";

type Copy = readonly [title: string, start: string, rank: string, locked: string, free: string,
  extra: string, cap: string, jump: string, pause: string, resume: string, result: string,
  challenge: string, copied: string, empty: string, error: string, earned: string, login: string];

export const runCopy: Record<AppLocale, Copy> = {
  ko: ["최애 런", "달리기 시작", "주간 랭킹", "곧 열려요", "남은 무료 판", "10P로 추가하기", "오늘 달릴 수 있는 판을 모두 썼어요", "점프", "멈춤", "계속 달리기", "이번 거리", "친구에게 도전 보내기", "링크를 복사했어요", "아직 기록이 없어요", "다시 시도", "1,000m 칭호", "로그인"],
  en: ["Favorite Run", "Start running", "Weekly rankings", "Coming soon", "Free runs left", "Add a run for 10P", "You’ve used all today’s runs", "Jump", "Pause", "Resume", "Run distance", "Challenge a friend", "Link copied", "No records yet", "Try again", "1,000 m title", "Sign in"],
  ja: ["推しラン", "走り始める", "週間ランキング", "近日公開", "無料プレイ残数", "10Pで追加", "本日のプレイ回数を使い切りました", "ジャンプ", "一時停止", "再開", "今回の距離", "友だちに挑戦を送る", "リンクをコピーしました", "まだ記録がありません", "再試行", "1,000mの称号", "ログイン"],
  "zh-Hans": ["本命跑酷", "开始跑步", "周排行榜", "即将开放", "剩余免费次数", "花10P增加一次", "今天的次数已用完", "跳跃", "暂停", "继续", "本次距离", "挑战好友", "已复制链接", "暂无记录", "重试", "1,000米称号", "登录"],
  "zh-Hant": ["本命跑酷", "開始跑步", "週排行榜", "即將開放", "剩餘免費次數", "花10P增加一次", "今天的次數已用完", "跳躍", "暫停", "繼續", "本次距離", "挑戰好友", "已複製連結", "暫無紀錄", "重試", "1,000公尺稱號", "登入"],
  es: ["Carrera con tu favorito", "Empezar", "Clasificación semanal", "Próximamente", "Carreras gratis restantes", "Añadir por 10P", "Ya usaste todas las carreras de hoy", "Saltar", "Pausar", "Continuar", "Distancia recorrida", "Reta a un amigo", "Enlace copiado", "Aún no hay marcas", "Reintentar", "Título de 1.000 m", "Iniciar sesión"],
  id: ["Lari Bareng Idola", "Mulai berlari", "Peringkat mingguan", "Segera hadir", "Sisa lari gratis", "Tambah dengan 10P", "Jatah lari hari ini habis", "Lompat", "Jeda", "Lanjut", "Jarak tempuh", "Tantang teman", "Tautan disalin", "Belum ada rekor", "Coba lagi", "Gelar 1.000 m", "Masuk"],
  vi: ["Chạy cùng thần tượng", "Bắt đầu chạy", "Bảng xếp hạng tuần", "Sắp mở", "Lượt miễn phí còn lại", "Thêm lượt với 10P", "Đã hết lượt hôm nay", "Nhảy", "Tạm dừng", "Tiếp tục", "Quãng đường", "Thách đấu bạn bè", "Đã sao chép liên kết", "Chưa có kỷ lục", "Thử lại", "Danh hiệu 1.000 m", "Đăng nhập"],
  th: ["วิ่งกับคนโปรด", "เริ่มวิ่ง", "อันดับประจำสัปดาห์", "เร็ว ๆ นี้", "รอบฟรีที่เหลือ", "เพิ่มรอบด้วย 10P", "ใช้รอบของวันนี้หมดแล้ว", "กระโดด", "หยุดชั่วคราว", "วิ่งต่อ", "ระยะทาง", "ท้าเพื่อน", "คัดลอกลิงก์แล้ว", "ยังไม่มีสถิติ", "ลองอีกครั้ง", "ฉายา 1,000 เมตร", "เข้าสู่ระบบ"],
  pt: ["Corrida com seu favorito", "Começar", "Ranking semanal", "Em breve", "Corridas grátis restantes", "Adicionar por 10P", "Você usou todas as corridas de hoje", "Pular", "Pausar", "Continuar", "Distância percorrida", "Desafiar um amigo", "Link copiado", "Ainda não há recordes", "Tentar novamente", "Título de 1.000 m", "Entrar"],
  fr: ["Course avec votre favori", "Démarrer", "Classement hebdomadaire", "Bientôt disponible", "Courses gratuites restantes", "Ajouter pour 10P", "Toutes les courses du jour ont été utilisées", "Sauter", "Pause", "Reprendre", "Distance parcourue", "Défier un ami", "Lien copié", "Aucun record", "Réessayer", "Titre des 1 000 m", "Se connecter"],
  ru: ["Забег с любимцем", "Начать забег", "Рейтинг недели", "Скоро", "Осталось бесплатных забегов", "Добавить за 10P", "Все забеги на сегодня использованы", "Прыжок", "Пауза", "Продолжить", "Дистанция", "Вызвать друга", "Ссылка скопирована", "Рекордов пока нет", "Повторить", "Титул за 1 000 м", "Войти"],
};
