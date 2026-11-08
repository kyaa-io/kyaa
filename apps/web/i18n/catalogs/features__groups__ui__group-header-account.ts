import type { TranslatedMessage } from "../messages";

// 5차 계정 메뉴(B2). ko/en은 group-header-account.tsx, 나머지 10개 언어는 여기.
export const messages = {
  "accountMenu": {"ja": "アカウントメニュー", "zh-Hans": "账户菜单", "zh-Hant": "帳戶選單", "es": "Menú de cuenta", "id": "Menu akun", "vi": "Menu tài khoản", "th": "เมนูบัญชี", "pt": "Menu da conta", "fr": "Menu du compte", "ru": "Меню аккаунта"},
  "accountPassport": {"ja": "パスポート", "zh-Hans": "护照", "zh-Hant": "護照", "es": "Pasaporte", "id": "Paspor", "vi": "Hộ chiếu", "th": "พาสปอร์ต", "pt": "Passaporte", "fr": "Passeport", "ru": "Паспорт"},
  "accountFriends": {"ja": "友だち・メッセージ", "zh-Hans": "好友·消息", "zh-Hant": "好友·訊息", "es": "Amigos · Mensajes", "id": "Teman · Pesan", "vi": "Bạn bè · Tin nhắn", "th": "เพื่อน · ข้อความ", "pt": "Amigos · Mensagens", "fr": "Amis · Messages", "ru": "Друзья · Сообщения"},
  "accountSettings": {"ja": "設定", "zh-Hans": "设置", "zh-Hant": "設定", "es": "Configuración", "id": "Pengaturan", "vi": "Cài đặt", "th": "การตั้งค่า", "pt": "Configurações", "fr": "Paramètres", "ru": "Настройки"},
  "accountLanguage": {"ja": "言語", "zh-Hans": "语言", "zh-Hant": "語言", "es": "Idioma", "id": "Bahasa", "vi": "Ngôn ngữ", "th": "ภาษา", "pt": "Idioma", "fr": "Langue", "ru": "Язык"},
  "accountOpenPage": {"ja": "ファンページを開設", "zh-Hans": "开设粉丝页面", "zh-Hant": "開設粉絲頁面", "es": "Abrir página de fans", "id": "Buka halaman penggemar", "vi": "Mở trang người hâm mộ", "th": "เปิดหน้าแฟนคลับ", "pt": "Abrir página de fãs", "fr": "Ouvrir une page de fans", "ru": "Открыть фан-страницу"},
  "accountLogout": {"ja": "ログアウト", "zh-Hans": "退出登录", "zh-Hant": "登出", "es": "Cerrar sesión", "id": "Keluar", "vi": "Đăng xuất", "th": "ออกจากระบบ", "pt": "Sair", "fr": "Se déconnecter", "ru": "Выйти"},
  "accountChoose": {"ja": "推しを選ぶ", "zh-Hans": "选择我的最爱", "zh-Hant": "選擇我的最愛", "es": "Elegir favorito", "id": "Pilih favorit", "vi": "Chọn thần tượng", "th": "เลือกคนโปรด", "pt": "Escolher favorito", "fr": "Choisir un favori", "ru": "Выбрать кумира"},
  "accountHearts": {"ja": "{1} ハート {0}", "zh-Hans": "{1} 爱心 {0}", "zh-Hant": "{1} 愛心 {0}", "es": "{0} corazones para {1}", "id": "{0} hati untuk {1}", "vi": "{0} tim cho {1}", "th": "{1} หัวใจ {0}", "pt": "{0} corações para {1}", "fr": "{0} cœurs pour {1}", "ru": "{0} сердец для {1}"},
  "accountPoints": {"ja": "ポイント {0}", "zh-Hans": "积分 {0}", "zh-Hant": "點數 {0}", "es": "{0} puntos", "id": "{0} poin", "vi": "{0} điểm", "th": "{0} แต้ม", "pt": "{0} pontos", "fr": "{0} points", "ru": "{0} баллов"}
} satisfies Record<string, TranslatedMessage>;
